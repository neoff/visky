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
 * authorization page for android
 * get VK auth page and remove defended scripts
 * to fetch after auth token and secret
 */
authForm.get('/vk', async (req: Request, res: Response) => {
  const params = {
    client_id: process.env.VK_ADMIN_ID,
    scope: 1,
    redirect_uri: "https://oauth.vk.com/blank.html",
    display: "mobile",
    lang: "en",
    revoke: 1,
    response_type: "token",
    v: "5.103"
  }
  
  console.log("<-------- auth.get =========", AuthUrl, params);
  
  try {
    const response = await AndroidClient.get(AuthUrl, { params });
    console.log("===Admin auth page SUCCESS, status:", response.status);
    
    let html: string = response.data;
    html = callBack(html, "/auth/vk");
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error: any) {
    console.error("===Admin auth page ERROR:", error.message);
    res.status(500).send({ errMessage: error.message });
  }
});
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .error {
      background: #fee;
      border: 1px solid #fcc;
      color: #c33;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }
    .info {
      color: #666;
      font-size: 12px;
      margin-top: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎵 Visky Login</h1>
    <p class="subtitle">Enter your VK credentials</p>
    
    <div id="error" class="error"></div>
    
    <form method="POST" action="/auth/vk" id="loginForm">
      <div class="form-group">
        <label for="email">Email or Phone</label>
        <input 
          type="text" 
          id="email" 
          name="email" 
          required 
          autocomplete="username"
          placeholder="example@email.com"
        />
      </div>
      
      <div class="form-group">
        <label for="pass">Password</label>
        <input 
          type="password" 
          id="pass" 
          name="pass" 
          required 
          autocomplete="current-password"
          placeholder="Your VK password"
        />
      </div>
      
      <button type="submit">Sign In</button>
    </form>
    
    <p class="info">
      Your credentials are sent directly to VK API<br>
      and are not stored on our servers
    </p>
  </div>
  
  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    
    form.addEventListener('submit', function(e) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
      
      const email = document.getElementById('email').value.trim();
      const pass = document.getElementById('pass').value;
      
      if (!email || !pass) {
        e.preventDefault();
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(simpleForm);
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

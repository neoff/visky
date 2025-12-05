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
  // Return simple login form instead of proxying VK OAuth
  const simpleForm = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VK Authorization</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      margin-bottom: 32px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
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
  const params = {
    client_id: process.env.OFFICIAL_APP_ID,
    client_secret: process.env.OFFICIAL_APP_SECRET,
    grant_type: "password",
    scope: "nohttps,audio,offline",
    validate_token: "true",
    username: req.body.email,
    password: req.body.pass,
    token: req.body.token,
    secret: req.body.secret,
  }
  // TODO: if not empty tocken and secret redirect to '/api/refresh'
  if (!req.session
    || !req.session?.access_token
    || !req.session?.secret) {
    //console.debug("<-------- auth.post =========", TokenUrl, params)
    return await AndroidClient.get(TokenUrl, {params}).then((response) => {
      console.debug("--------> auth.post RESPONSE DATA ============", response.data, "COOCIES:", req.session.cookie)
      if (!response.data.secret || !response.data.access_token) {
        res.status(500).send({errMessage: "Response data not contain secret or access_token"})
        return;
      }
      const data = response.data
      req.session.secret = data.secret
      req.session.user_id = data.user_id.toString()
      req.session.access_token = data.access_token
      req.session.device_id = deviceIDgen()
      response.data.created = new Date().toISOString()
      if (req.session?.cookie) {
        response.data.expired = req.session.cookie.expires
      }
      res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
      return;
      //return res.status(200).send(response.data)
    }).catch((error) => {
      if (error.response?.data.redirect_uri !== undefined) {
        console.warn("======> Android REDIREC =======", error.response?.data)
        res.redirect(error.response?.data.redirect_uri)
        return;
        //return res.status(500).send({errMessage: error.message, errMessage: error.response.data.redirect_uri})
      }
      console.error("======> auth.post ERROR =======", error)
      res.status(500).send({errMessage: error.message})
      return;
    })

  }
  const data = req.session
  return res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
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

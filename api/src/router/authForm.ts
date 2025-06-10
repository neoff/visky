import {vkTokenAncor} from "@/configurations"
import {apiUrls} from "@/constants"
import {AndroidClient, AuthUrl, deviceIDgen, encodeQueryData, TokenUrl} from "@/helpers"
import passport from "@/helpers/strategies"
import {checkAuthAndroid, method} from "@/helpers/vk"
import {Request, Response} from "@/types"
import express from "express"
import fs, {readFileSync} from 'fs'
import {session} from "passport"
import path from "path"

export const authForm = express.Router()

const callBack = (html: string, url: string) => {

  let regex;

  //regex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
  //remove ',window._preventEvents=["click","touchstart","touchend","mouseover","mousemove"]'
  regex = /,window._preventEvents=\["click","touchstart","touchend","mouseover","mousemove"\]/gi
  html = html.replace(regex, "")
  // remove  '&&location.reload()' only inside second <script>...</script>
  regex = /&&location.reload\(\)/gi
  html = html.replace(regex, "")
  //replace <body...>...<form method=... action=... to <form method="post" action="/auth/vk2"
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
  /**
   * //old version remove if not needed
   * const queryParam = await encodeQueryData(params)
   * return res.redirect(AuthUrl+"?"+queryParam)
   */

  if (!req.session
    || !req.session?.access_token
    || !req.session?.secret) {
    return await AndroidClient.get(AuthUrl, {params}).then((response) => {
      //console.debug("===Admin auth page response", response)
      //const resp = callBack(response.data, apiUrls.authAdminAppUrl)
      const resp = callBack(response.data, "vk")
      res.setHeader('Content-Type', 'text/html')
      res.status(200).send(resp)
    }).catch((error) => {
      console.error("===Admin auth page error", error)
      res.status(500).send({errMessage: error.message})
    })
      .finally(() => {
        res.end()
      })
  }
  const data = req.session
  return res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
})

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

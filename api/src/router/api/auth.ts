// src/router/api/auth.ts
import {deviceIDgen} from "@/helper"
import {checkAuthAndroid, vkMethod} from "@/helper/vk"
import {Request, Response} from "@/types"
import express from "express"
import type {VkRefreshTokenResponse, VkUserInfoResponse} from "@/__genedated__/openapi/vk";

export const auth = express.Router()

/** OAUTH */
/*auth.get('/vk-oauth', passport.authenticate('vkontakte'))
auth.get('/vk-oauth/callback',
    passport.authenticate('vkontakte', { failureRedirect: '/auth/vk-oauth' }),
    (req, res) => {
        res.redirect('OAuthLogin://login?user=' + JSON.stringify(req.user))
    }
)*/
/** END/ OAUTH */


const UserProfile = async (req: Request, res: Response) => {
  return await vkMethod(req, "execute.getUserInfo", {func_v: 9}, true).then((response) => {
    //console.log("---> REFRESH auth.UserProfile ---response", response)
    let user: VkUserInfoResponse | undefined = response?.response as VkUserInfoResponse | undefined
    req.session.user_id = user?.profile?.id?.toString()
    return user
  }).catch((error) => {
    console.error("----> UserProfile --- error", error)
    throw new Error("Error in getUserInfo")
  })
}

const refreshSession = async (req: Request, res: Response) => {
  console.log("=== RefreshSession ", req.session)

  const user = await UserProfile(req, res)
  const refresh = await vkMethod(req, 'auth.refreshToken', {lang: "ru"}).then((response) => {
    let ref: VkRefreshTokenResponse | undefined = response as VkRefreshTokenResponse
    console.log("---> REFRESH auth.refreshToken ---response", response)
    res.expires = req.session.cookie.expires?.getDate() ?? null
    res.maxAge = req.session.cookie.originalMaxAge
    res.created = new Date().toISOString()
    res.token = ref?.token
    res.secret = ref?.secret
    return res
  }).catch((error) => {
    console.error("---> REFRESH auth.refreshToken ---error", error)
    throw new Error(error.error_msg)
  })

  req.session.user_id = user?.profile?.id?.toString()
  req.session.access_token = refresh.token
  req.session.secret = refresh.secret
  req.session.created = refresh.created
  req.session.maxAge = refresh.maxAge
  req.session.expires = refresh.expires
  return req.session
}

auth.post("/token", async (req: Request, res: Response) => {
  console.debug(`=== Token body: `, req.body)
  console.debug(`=== Token  session: `, req.session)
  if (req.body?.vkurl != undefined && req.body?.vkurl != "") {
    req.body.url = req.body.vkurl;
  }
  if (!req.body || !req.body.url) {
    console.error("===Token ERROR: No vkurl in post request")
    res.status(400).send({errMessage: "No vkurl in post request"}).end()
    return;
  }
  const sharp: boolean = req.body.url.includes("#") || false
  const token: boolean = req.body.url.includes("access_token=") || false
  //const secret: boolean = req.body.url.includes("secret=") || false
  if (!sharp || !token) {
    console.error("===Token: ERROR No 'access_token' in url")
    res.status(400).send({errMessage: "No 'access_token' or 'secret' in url"}).end()
    return;
  }

  const fragments: string = req.body.url.split("#")[1]
  fragments.split("&").map(fragment => {
    const [key, value] = fragment.split("=")
    req.session[key] = value
  })
  const expires: Date | null | undefined = req.session.cookie.expires
  req.session.expires = expires?.getDate() ?? null
  req.session.maxAge = req.session.cookie.originalMaxAge
  req.session.created = new Date().toISOString()

  if (req.session.secret !== undefined && (req.session.secret !== null || req.session.secret !== "")) {
    req.session.device_id = deviceIDgen()
    console.info("===Token: set session new device_id: ", req.session.device_id)
  }
  req.body.session = req.session
  console.debug("===Token: set session new new: ", req.body.session)
  return await refreshSession(req, res).then((response) => {
    console.debug("===Token: response", response)
    res.status(200).send(response).end()
  }).catch((error) => {
    console.error("===Token: ERROR", error)
    const msg = error?.error_msg || error?.message || "refreshSession failed";
    res.status(500).send({errMessage: msg}).end()
  })
})

auth.post("/refresh", async (req: Request, res: Response) => {
  console.log("=== POST Refresh (establish session):", req.body)
  
  if (!req.body || !req.body.access_token || !req.body.secret) {
    console.error("===Refresh ERROR: No session data in post request")
    res.status(400).send({errMessage: "No access_token/secret in request"}).end()
    return;
  }
  
  // Restore session from request body
  req.session.user_id = req.body.user_id
  req.session.access_token = req.body.access_token
  req.session.secret = req.body.secret
  req.session.created = req.body.created
  req.session.maxAge = req.body.maxAge
  req.session.expires = req.body.expires
  req.session.device_id = req.body.device_id || deviceIDgen()
  
  console.log("✅ Session restored, cookie will be set:", req.session.id)
  res.status(200).send({
    success: true,
    session_id: req.session.id,
    user_id: req.session.user_id
  }).end()
})


auth.get("/refresh", checkAuthAndroid, async (req: Request, res: Response) => {
  console.log("=== GET Refresh======================= req", req.body)

  return await refreshSession(req, res)
    .then((response) => {
      res.status(200).send(response).end()
    })
    .catch((error) => {
      console.error("----> REFRESH auth.refreshToken ---error", error)
      const msg = error?.error_msg || error?.message || "Failed refresh";
      res.status(500).send({errMessage: msg}).end()
    })

})

auth.get("/profile", checkAuthAndroid, async (req: Request, res: Response) => {
  return await UserProfile(req, res).then((response) => {
    res.status(200).send(response).end()
  })
    .catch((error) => {
      console.error("===Profile =====> error: ", error)
      const msg = error?.error_msg || error?.message || "Failed get profile";
      res.status(500).send({errMessage: msg}).end()
    })
})

auth.get('/vk', async (req: Request, res: Response) => {
  console.log("===Redirect =====> /auth/vk")
  res.redirect("/auth/vk")
})
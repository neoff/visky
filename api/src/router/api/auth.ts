// src/router/api/auth.ts
import {deviceIDgen} from "@/helper"
import {checkAuthAndroid, vkMethod} from "@/helper/vk"
import {performDirectGrant} from "@/helper/directGrant"
import {Request, Response} from "@/types"
import express from "express"
import type {VkRefreshTokenResponse, VkUserInfoResponse} from "@/__genedated__/openapi/vk";

export const auth = express.Router()

/**
 * Direct token grant (password grant) — the only way to obtain an audio-capable
 * token + signing `secret`. Emulates a legacy Android app; VK ID is bypassed.
 *
 * POST /api/auth/direct
 *  body: { login, password, code?, captcha_sid?, captcha_key?, device_id? }
 *
 * Responses:
 *  200 { access_token, secret, user_id, device_id }        -> success
 *  401 { error:'need_validation', validation_type, phone_mask, validation_sid, device_id }
 *  401 { error:'need_captcha', captcha_sid, captcha_img, device_id }
 *  400 { errMessage }                                        -> bad creds / other
 *
 * On need_validation the client resends the SAME body plus `code` (and the
 * returned `device_id`). On need_captcha it resends plus `captcha_sid`+`captcha_key`.
 */
auth.post("/direct", async (req: Request, res: Response) => {
  const {login, password} = req.body || {}
  if (!login || !password) {
    res.status(400).send({errMessage: "No login or password"}).end()
    return
  }

  try {
    const result = await performDirectGrant({
      login,
      password,
      code: req.body.code,
      captcha_sid: req.body.captcha_sid,
      captcha_key: req.body.captcha_key,
      device_id: req.body.device_id, // stable across the 2FA/captcha retry
    })

    if (result.kind === "ok") {
      req.session.access_token = result.access_token
      req.session.secret = result.secret
      req.session.user_id = result.user_id
      req.session.device_id = result.device_id
      req.session.created = new Date().toISOString()
      req.session.maxAge = req.session.cookie?.originalMaxAge
      req.session.expires = req.session.cookie?.expires?.getDate() ?? null
      console.log("✅ direct grant ok:", {user_id: result.user_id, has_secret: !!result.secret})
      res.status(200).send({
        access_token: result.access_token,
        secret: result.secret,
        user_id: result.user_id,
        device_id: result.device_id,
      }).end()
      return
    }

    if (result.kind === "need_validation") {
      console.warn("🔐 direct grant: 2FA required", result.validation_type)
      res.status(401).send({
        error: "need_validation",
        validation_type: result.validation_type,       // 2fa_sms | 2fa_app | 2fa_callreset
        phone_mask: result.phone_mask,
        validation_sid: result.validation_sid,
        device_id: result.device_id,
      }).end()
      return
    }

    if (result.kind === "need_captcha") {
      console.warn("🧩 direct grant: captcha required")
      res.status(401).send({
        error: "need_captcha",
        captcha_sid: result.captcha_sid,
        captcha_img: result.captcha_img,
        device_id: result.device_id,
      }).end()
      return
    }

    console.error("❌ direct grant failed:", result.message)
    res.status(400).send({errMessage: result.message}).end()
  } catch (error: any) {
    console.error("❌ direct grant exception:", error?.message)
    res.status(500).send({errMessage: error?.message || "Direct grant failed"}).end()
  }
})

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

  // device_id must exist before refreshSession: it is baked into the audio
  // request signature (md5(url+secret)) and MUST stay stable for the session.
  // The relay-OAuth hash carries no secret, so mint one here if absent.
  if (!req.session.device_id) {
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

/**
 * A compact profile for the Settings screen.
 * GET /api/auth/me
 *
 * `execute.getUserInfo` (behind /profile) answers with the whole VK bootstrap —
 * ad limits, feature flags, hundreds of lines — and no avatar. This is the four
 * fields the app actually shows.
 */
auth.get("/me", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const response = await vkMethod(req, "users.get", {
      user_ids: req.session.user_id,
      fields: "photo_200,screen_name"
    }, true);

    const user = ((response.response as any) ?? [])[0];
    if (!user) {
      res.status(404).send({errMessage: "Profile not found"});
      return;
    }

    res.status(200).send({
      id: user.id,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      screen_name: user.screen_name ?? "",
      photo: user.photo_200 ?? ""
    });
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

auth.get('/vk', async (req: Request, res: Response) => {
  console.log("===Redirect =====> /auth/vk")
  res.redirect("/auth/vk")
})
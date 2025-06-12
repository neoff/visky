import {deviceIDgen} from "@/helpers"
import {checkAuthAndroid, method} from "@/helpers/vk"
import {Request, Response} from "@/types"
import express from "express"

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
  return await method(req, "execute.getUserInfo", {func_v: 9}, true).then((response) => {
    //console.log("---> REFRESH auth.UserProfile ---response", response)
    req.session.user_id = response?.profile?.id.toString()
    return response
  }).catch((error) => {
    console.error("----> UserProfile --- error", error)
    throw new Error("Error in getUserInfo")
  })
}

const refreshSession = async (req: Request, res: Response) => {
  console.log("=== RefreshSession ", req.session)

  const user = await UserProfile(req, res)
  const refresh = await method(req, 'auth.refreshToken', {lang: "ru"}).then((response) => {
    console.log("---> REFRESH auth.refreshToken ---response", response)
    response.expires = req.session.cookie.expires
    response.maxAge = req.session.cookie.originalMaxAge
    response.created = new Date().toISOString()
    return response
  }).catch((error) => {
    console.error("---> REFRESH auth.refreshToken ---error", error)
    res.status(500).send({errMessage: error.error_msg}).end()
    throw new Error(error.error_msg)
  })

  req.session.user_id = user?.profile?.id.toString()
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
  if (!req.body || !req.body.vkurl) {
    console.error("===Token ERROR: No vkurl in post request")
    res.status(400).send({errMessage: "No vkurl in post request"}).end()
    return;
  }
  const sharp: boolean = req.body.vkurl.includes("#") || false
  const token: boolean = req.body.vkurl.includes("access_token=") || false
  //const secret: boolean = req.body.vkurl.includes("secret=") || false
  if (!sharp || !token) {
    console.error("===Token: ERROR No 'access_token' in vkurl")
    res.status(400).send({errMessage: "No 'access_token' or 'secret' in vkurl"}).end()
    return;
  }

  const fragments: string = req.body.vkurl.split("#")[1]
  fragments.split("&").map(fragment => {
    const [key, value] = fragment.split("=")
    req.session[key] = value
  })
  req.session.expires = req.session.cookie.expires
  req.session.maxAge = req.session.cookie.originalMaxAge
  req.session.created = new Date().toISOString()

  if (req.session.secret !== undefined && (req.session.secret !== null || req.session.secret !== "")) {
    req.session.device_id = deviceIDgen()
    console.info("===Token: set session new device_id: ", req.session.device_id)
    //return res.redirect(`refresh`)
  }
  req.body.session = req.session
  console.debug("===Token: set session new new: ", req.body.session)
  return await refreshSession(req, res).then((response) => {
    console.debug("===Token: response", response)
    res.status(200).send(response).end()
    //res.redirect(`profile`)
  }).catch((error) => {
    console.error("===Token: ERROR", error)
    res.status(500).send({errMessage: error.error_msg}).end()
    throw new Error(error.error_msg)
  })
  //return res.status(200).send({"redirect": `${apiUrls.refreshUrl}, session: ${req.session}`}).end()
})

auth.post("/refresh", async (req: Request, res: Response) => {
  console.log("=== POST Refresh======================= req", req.body)
  //if(!req.body || !req.body.session || !req.body.session.access_token || !req.body.session.secret) {
  if (!req.body || !req.body.access_token || !req.body.secret) {
    console.error("===Refresh ERROR: No session data in post request")
    res.status(400).send({errMessage: "No session in request"}).end()
    return;
  }
  //req.session = req.body
  req.session.user_id = req.body.user_id
  req.session.access_token = req.body.access_token
  req.session.secret = req.body.secret
  req.session.created = req.body.created
  req.session.maxAge = req.body.maxAge
  req.session.expires = req.body.expires
  res.redirect(`refresh`)
})


auth.get("/refresh", checkAuthAndroid, async (req: Request, res: Response) => {
  console.log("=== GET Refresh======================= req", req.body)

  return await refreshSession(req, res)
    .then((response) => {
      //res.status(200).send(response).end()
      res.redirect(`profile`)
    })
    .catch((error) => {
      console.error("----> REFRESH auth.refreshToken ---error", error)
      res.status(500).send({errMessage: error.error_msg}).end()
      throw new Error(error.error_msg)
    })

})

auth.get("/profile", checkAuthAndroid, async (req: Request, res: Response) => {
  return await UserProfile(req, res).then((response) => {
    res.status(200).send(response).end()
  })
    .catch((error) => {
      console.error("===Profile =====> error: ", error)
      res.status(500).send(error).end()
    })
})
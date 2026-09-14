import {vkTokenAncor} from "@/configurations"
import {deviceIDgen} from "@/helper"
import {
  buildGrantUrl,
  buildValidateResendQuery,
  parseGrantResponse,
  parseValidateResend,
  performDirectGrant,
  requestValidationResend,
} from "@/helper/directGrant"
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
    // Pin the banner over VK's own sticky header — injected plain into <body> it
    // scrolls up under the VK logo bar and the error text is clipped (unreadable).
    // fixed + max z-index + a body top-pad keeps the full message on screen.
    const banner =
      `<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;` +
      `background:#fc3c44;color:#fff;padding:12px 16px;text-align:center;` +
      `font:14px/1.4 -apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)">${error}</div>` +
      `<div style="height:56px"></div>`
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
  .otp { display:flex; gap:8px; justify-content:center; margin:0 0 16px; }
  .otp .cell { width:44px; height:52px; padding:0; margin:0; text-align:center; font-size:22px;
               font-weight:500; background:#f2f3f5; color:#000; border:1px solid transparent; border-radius:10px; }
  .otp .cell:focus { outline:none; border-color:#3f8ae0; background:#fff; }
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

// Russian declension for "цифра" after a number: 1→цифру, 2-4→цифры, else цифр.
const pluralDigits = (n: number): string => {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return "цифру"
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return "цифры"
  return "цифр"
}

// Wording for every 2FA channel VK can pick. `len` is how many digits VK wants.
// For `2fa_callreset` VK places a FLASH CALL and the code is the last 6 digits of
// the CALLING number (no SMS at all). NOTE: VK's own `error_description` says "use
// last 4 digits", but that text LIES — submitting 4 returns
// `otp_format_is_incorrect`; VK actually wants 6 (matches VK ID web). So we do NOT
// parse the description for length; callreset is fixed at 6.
const validationCopy = (type?: string, len = 6): {title: string; hint: string; len: number} => {
  switch (type) {
    case "2fa_callreset":
    case "callreset":
      return {
        title: "Подтверждение входа",
        hint: `Сейчас поступит звонок. Введите последние ${len} ${pluralDigits(len)} номера, с которого звонят — отвечать не нужно.`,
        len,
      }
    case "2fa_app":
      return {title: "Код из приложения", hint: "Введите код из приложения-аутентификатора.", len}
    case "2fa_sms":
      return {title: "Код из SMS", hint: "Введите код из SMS.", len}
    default:
      return {title: "Подтверждение входа", hint: "Введите код подтверждения.", len}
  }
}

// len: digit count VK asked for (parsed from its description); undefined -> 6.
type ValState = {sid?: string; type?: string; mask?: string; resend?: string; len?: number}

const smsForm = (v: ValState, notice?: string, delay?: number) => {
  const c = validationCopy(v.type, v.len ?? 6)
  // VK returns `delay` seconds before it will actually re-deliver; asking sooner
  // just returns the same countdown, so keep the button disabled until then.
  const wait = typeof delay === "number" && delay > 0 ? delay : 0
  const canResend = !!v.sid && !!v.resend
  return PAGE(`
  <h1>${c.title}</h1>
  <p class="hint">${c.hint}${v.mask ? `<br>${v.mask}` : ""}</p>
  ${notice ? `<p class="ok">${notice}</p>` : ""}
  <form method="post" action="/auth/vk" id="cf">
    <input type="hidden" name="code" id="code">
    <label>Код</label>
    <div class="otp" id="otp">${Array.from({length: c.len}, (_, i) =>
      `<input class="cell" type="text" inputmode="numeric" maxlength="1"${i === 0 ? ' autocomplete=\"one-time-code\" autofocus' : ""}>`,
    ).join("")}</div>
    <button type="submit">Подтвердить</button>
  </form>
  <script>
    (function(){
      var n = ${c.len};
      var cells = document.getElementById('otp').querySelectorAll('.cell');
      var hidden = document.getElementById('code');
      var form = document.getElementById('cf');
      function sync(){ var s=''; for (var i=0;i<cells.length;i++){ s+=cells[i].value; } hidden.value=s; return s; }
      function trySubmit(){ if (sync().length === n) form.submit(); }
      form.addEventListener('submit', sync);
      for (var i=0;i<cells.length;i++){ (function(i){
        var el = cells[i];
        el.addEventListener('input', function(){
          el.value = el.value.replace(/[^0-9]/g,'').slice(-1);
          if (el.value && i < n-1) cells[i+1].focus();
          trySubmit();
        });
        el.addEventListener('keydown', function(e){
          if (e.key === 'Backspace' && !el.value && i > 0){ cells[i-1].focus(); cells[i-1].value=''; sync(); e.preventDefault(); }
          else if (e.key === 'ArrowLeft' && i > 0){ cells[i-1].focus(); e.preventDefault(); }
          else if (e.key === 'ArrowRight' && i < n-1){ cells[i+1].focus(); e.preventDefault(); }
        });
        el.addEventListener('paste', function(e){
          e.preventDefault();
          var src = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g,'').slice(0,n);
          for (var j=0;j<src.length && i+j<n;j++){ cells[i+j].value = src[j]; }
          cells[Math.min(i+src.length, n-1)].focus();
          trySubmit();
        });
      })(i); }
      if (cells[0]) cells[0].focus();
    })();
  </script>
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

// A blocked account. VK reports it as `need_validation`, but no code exists to
// enter — the only way out is unblocking the account on vk.com — so say that
// plainly instead of showing a code field that can never be satisfied.
const bannedPage = (message: string, memberName?: string) => PAGE(`
  <h1>Аккаунт заблокирован</h1>
  <p class="hint">${memberName ? `${memberName}: ` : ""}${message}</p>
  <p class="hint">Код подтверждения тут не поможет — снимите блокировку на vk.com,
  затем войдите снова.</p>
  <a href="https://vk.com/restore">Открыть vk.com/restore</a>
  <a href="/auth/vk?reset=1">Начать заново</a>`)

type FbState = {login: string; password: string; device_id: string; code?: string; captcha_sid?: string; captcha_redirect?: string}

const html = (res: Response, body: string) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(body).end()
}

// WHERE THE GRANT RUNS.
//
// VK returns `need_captcha` on EVERY password grant issued from the cluster's
// egress IP — the node is flagged (captcha_ratio 2.6). The same credentials sent
// from a residential IP in the same second come back with an access_token, no
// captcha and no 2FA. Verified 2026-08-24 by running the identical http2 request
// from inside the pod and from a dev machine, for both test accounts.
//
// So by default we do NOT call VK from here. We 302 the WebView straight at the
// token endpoint: the request then leaves from the PHONE's IP, over HTTP/2 (the
// browser's default), and is never challenged. VK answers with a JSON body,
// which the app reads out of the page and hands back to GET /vk/next — from
// there the existing finalizeGrant logic renders 2FA / captcha / errors exactly
// as before. Set VK_GRANT_ON_SERVER=true to go back to grants from the server.
const grantOnServer = process.env.VK_GRANT_ON_SERVER === "true"

// Hand the grant to the WebView (see above). Everything the follow-up needs
// (creds, device_id, captcha_sid) already lives in the session.
//
// We do NOT send the WebView straight to oauth.vk.com/token. VK answers that with
// `application/json`, and an Android WebView is not guaranteed to render it —
// WebView 66 shows a blank page for it (checked on the emulator), which would be
// another silent hang. Instead we land on oauth.vk.com/blank.html (a real, empty,
// CSP-free page on the SAME origin) and put the grant query in the URL FRAGMENT,
// which is never sent to VK. The app's injected script reads the fragment and
// issues a same-origin `fetch('/token?…')`, whose body it can read regardless of
// how the WebView would have rendered it — and the token never appears on screen.
const delegateGrant = (res: Response, input: Parameters<typeof buildGrantUrl>[0]): void => {
  const {url, device_id} = buildGrantUrl(input)
  console.log("=====> delegating grant to the device:", {
    login: input.login,
    device_id,
    code: input.code ? "yes" : undefined,
    success_token: input.success_token ? "yes" : undefined,
  })
  const query = url.slice(url.indexOf("?") + 1)
  res.redirect(`https://oauth.vk.com/blank.html#g=${encodeURIComponent(query)}`)
}

// Ask VK (auth.validatePhone) to (re)deliver the 2FA code, run on the DEVICE — the
// cluster IP gets "Captcha needed" here just like the grant. The app reads the
// JSONP result and posts it back to /vk/validate-next. Used both by the manual
// resend link and by the automatic call-trigger on the first callreset screen.
const delegateResend = (res: Response, sid: string): void => {
  console.log("=====> delegating 2FA resend to the device:", {sid})
  res.redirect(`https://oauth.vk.com/blank.html#r=${encodeURIComponent(buildValidateResendQuery(sid))}`)
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
    // Absolute: this fires from /auth/vk, /auth/vk/resume AND /auth/vk/next, and
    // a relative "blank.html" would resolve against each of those differently.
    res.redirect(
      `/auth/blank.html#success=1&access_token=${result.access_token}` +
      `&user_id=${result.user_id}&secret=${result.secret}&device_id=${result.device_id}`
    )
    return
  }

  if (result.kind === "banned") {
    console.error("⛔ account banned:", result.message)
    delete (req.session as any).fb
    html(res, bannedPage(result.message, result.member_name))
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
    // NB: do NOT parse a digit count from result.description — VK's callreset text
    // claims "use last 4 digits" but actually wants 6 (4 -> otp_format_is_incorrect).
    // smsForm defaults callreset to 6 via validationCopy.
    const val: ValState = {
      sid: result.validation_sid,
      type: result.validation_type,
      mask: result.phone_mask,
      resend: result.validation_resend,
    }
    ;(req.session as any).val = val
    // callreset places the flash call ONLY when auth.validatePhone runs — the bare
    // need_validation never rings the phone (verified: the call arrived only after
    // a manual "resend" tap). Auto-trigger the resend once per login so the call
    // comes immediately; the device performs it and lands on /vk/validate-next,
    // which renders this same 2FA form with the real countdown.
    const isCallreset = /callreset/.test(result.validation_type || "")
    if (isCallreset && result.validation_sid && !grantOnServer && !(req.session as any).callTriggered) {
      ;(req.session as any).callTriggered = true
      delegateResend(res, result.validation_sid)
      return
    }
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

  // A wrong/expired 2FA code (VK: invalid_request / wrong_otp / "Invalid code")
  // is NOT a login failure — the password was fine, only the code was off. If a
  // 2FA challenge is still in flight, re-render the code form with the error so
  // the user can enter a fresh code, instead of dumping them back to an empty
  // login form (which loses the whole 2FA context). The code expiring during a
  // captcha detour lands here too, so this is the normal retry path.
  const val = (req.session as any).val as ValState | undefined
  const wrongCode = /wrong_otp|invalid.?code|неверный|otp/i.test(
    `${result.message} ${result.raw?.error_type || ""}`,
  )
  if (val?.sid && wrongCode) {
    console.warn("🔁 wrong 2FA code, re-prompting:", result.message)
    // Drop the stale pending code so the next resume does not replay it.
    const fb = (req.session as any).fb as FbState | undefined
    if (fb) delete fb.code
    html(res, smsForm(val, "Неверный код. Введите код ещё раз."))
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

  // A fresh login (email present) starts a new challenge chain — clear the
  // one-shot auto-call guard so the next callreset screen rings the phone again.
  if (req.body.email) delete (req.session as any).callTriggered
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
  ;(req.session as any).fb = {login, password, device_id, code: req.body.code || undefined} as FbState

  const input = {
    login,
    password,
    device_id,
    code: req.body.code,
    captcha_sid: req.body.captcha_sid,
    captcha_key: req.body.captcha_key,
  }

  if (!grantOnServer) {
    delegateGrant(res, input)
    return
  }

  try {
    finalizeGrant(req, res, await performDirectGrant(input))
  } catch (error: any) {
    console.error("======> grant ERROR:", error?.message)
    serveLoginError(req, res, error?.message || "Ошибка авторизации")
  }
})

// The device performed the grant and read VK's JSON out of the page; ?d carries
// it verbatim. Parsing it here keeps every downstream step (2FA page, captcha
// redirect, error page, session storage) identical to the server-grant path.
authForm.get("/vk/next", async (req: Request, res: Response) => {
  const prev = (req.session as any).fb as FbState | undefined
  const device_id = prev?.device_id || (req.session as any).dev || deviceIDgen()
  let data: any
  try {
    data = JSON.parse(String(req.query.d || ""))
  } catch {
    console.error("======> /vk/next: unparseable grant payload")
    serveLoginError(req, res, "Не удалось прочитать ответ VK. Войдите заново.")
    return
  }
  console.log("<===== device grant response:", JSON.stringify(data).slice(0, 300))
  finalizeGrant(req, res, parseGrantResponse(data, device_id))
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
  const input = {
    login: prev.login,
    password: prev.password,
    device_id: prev.device_id,
    // Re-attach the pending 2FA code. If the code-submit grant was interrupted by
    // a captcha, VK needs BOTH the code and the success_token on the retry —
    // dropping the code here made VK re-challenge for 2FA after every solved
    // captcha (observed: solve captcha -> back to the SMS field).
    code: prev.code,
    captcha_sid: success_token ? prev.captcha_sid : undefined,
    success_token,
  }

  if (!grantOnServer) {
    delegateGrant(res, input)
    return
  }

  try {
    finalizeGrant(req, res, await performDirectGrant(input))
  } catch (error: any) {
    console.error("======> resume grant ERROR:", error?.message)
    serveLoginError(req, res, error?.message || "Ошибка авторизации")
  }
})

// Ask VK to re-deliver the 2FA code (e.g. switch a flash call over to SMS).
// VK enforces its own countdown: calling early just returns the remaining
// `delay`, which we render as a disabled link with a timer.
// Render the 2FA page after a resend attempt, whoever performed it.
const renderResend = (
  req: Request,
  res: Response,
  val: ValState,
  r: {validation_type?: string; validation_resend?: string; delay?: number; error?: string},
): void => {
  if (r.validation_type) val.type = `2fa_${r.validation_type}`.replace("2fa_2fa_", "2fa_")
  if (r.validation_resend) val.resend = r.validation_resend
  ;(req.session as any).val = val
  const notice = r.error
    ? undefined
    : r.delay
      ? `Код можно запросить снова через ${r.delay} с.`
      : "Код отправлен повторно."
  html(res, smsForm(val, notice ?? `Не удалось запросить код: ${r.error}`, r.delay))
}

authForm.get("/vk/validate-resend", async (req: Request, res: Response) => {
  const val = (req.session as any).val as ValState | undefined
  if (!val?.sid) {
    serveLoginError(req, res, "Сессия истекла. Войдите заново.")
    return
  }
  // The resend is a VK API call and so hits the same flagged-IP wall as the
  // grant: from the cluster it comes back "Captcha needed" (observed live on the
  // 2FA page), which left the only escape from an undelivered flash call dead.
  // Hand it to the device the same way — api.vk.com has no CORS but does support
  // JSONP, so the app loads it as a script and posts the JSON back.
  if (!grantOnServer) {
    delegateResend(res, val.sid)
    return
  }
  renderResend(req, res, val, await requestValidationResend(val.sid))
})

// The device performed the resend; ?d carries auth.validatePhone's JSON.
authForm.get("/vk/validate-next", async (req: Request, res: Response) => {
  const val = (req.session as any).val as ValState | undefined
  if (!val?.sid) {
    serveLoginError(req, res, "Сессия истекла. Войдите заново.")
    return
  }
  let data: any
  try {
    data = JSON.parse(String(req.query.d || ""))
  } catch {
    renderResend(req, res, val, {error: "не удалось прочитать ответ VK"})
    return
  }
  console.log("<===== device validatePhone:", JSON.stringify(data).slice(0, 200))
  renderResend(req, res, val, parseValidateResend(data))
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

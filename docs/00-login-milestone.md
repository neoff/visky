# 00 — Login / VK audio auth milestone

Full record of the VK authentication rework so the work can be resumed.
Written 2026-08-23, updated 2026-08-24 (**login now works end to end**).

> Credentials are NOT inlined here (avoid committing secrets). They live in `api/.env`
> (`VK_DIRECT_*` + test creds). Accounts referenced below by phone/email only.

---

## Goal

The app needs an **audio-capable** VK token to pull FRISKY playlists (`audio.get`). VK moved
login to VK ID, which broke the old flow. Only the **direct password grant** against a legacy
audio app returns a token **+ signing `secret`** that works for `audio.*`. Everything else
(VK ID web OAuth, relay, anonymous token) has **no audio** (`audio.get` → "Unknown method").

The app opens a WebView at the backend `/auth/vk`, the backend drives the grant, and on success
redirects to `blank.html#access_token=..&secret=..&user_id=..&device_id=..` which the app catches
to sign in.

---

## Status (2026-08-24, evening)

**The captcha was never the real problem.** The cluster's egress IP is flagged: VK answers
`need_captcha` to *every* grant from it, while the same credentials from a residential IP return a
token outright, in the same second (root cause 15). The grant now runs **on the phone** — the
backend 302s the WebView at `oauth.vk.com/token` — so VK is never challenged in the first place.

Earlier chain (login → not_robot → `success_token` → retry → token + secret) does work and is kept
as the fallback for the challenges that can still appear, but it should now be a rare path.

Not yet confirmed on a device: the device-side grant needs a new app build (see *Deployed state*).
Remaining constraint if a captcha ever does appear: **the WebView must be Chromium ≥ 94**
(root cause 8). The 2captcha fallback was never needed.

---

## Root causes discovered (each cost a debugging cycle)

1. **HTTP/1.1 → hard flood.** VK's anti-bot on `oauth.vk.com/token` HARD-floods HTTP/1.1
   requests (`9;Flood control` / `password_bruteforce_attempt`) but only soft-challenges HTTP/2
   ones (`need_captcha`). Node axios/https speak HTTP/1.1 → every server grant flooded even with
   correct creds and a clean IP. **NOT an IP/account/data problem.** Proven same-second, one machine:
   `curl --http1.1` → flood; `curl --http2` → captcha/token; `node http2` → captcha/token.
   **FIX:** `performDirectGrant` issues the grant with the native **`http2`** module. NEVER revert
   to axios/got/https.

2. **Wrong default app pair.** Default was Kate Mobile `2685278` (globally rate-limited → floods).
   **FIX:** default is now **VK Android `2274003`** + secret `hHbZxrka2uZ6jB1inYsH` + UA
   `VKAndroidApp/7.7-9034 ...`. Dropped `OFFICIAL_APP_ID`/`VK_ADMIN_ID` fallbacks (footguns).

3. **GCM receipt does NOT bypass grant captcha.** Ran `vkaudiotoken` itself → same flood. Its
   receipt only unlocks audio for Kate tokens via `auth.refreshToken` — our VK Android token
   already does audio, so receipt is irrelevant here.

4. **The captcha is `not_robot` (interactive), the old image is dead.** `captcha.php?source=api-oauth`
   302s to `image_not_supported.png` ("update your app"). The grant's `need_captcha` returns a
   `redirect_uri` = `id.vk.com/not_robot_captcha?...` — a JS/VK-Bridge widget.

5. **not_robot internals (from st.vk.com bundle):** on solve, `apiService.requestCheck()` returns
   `{status, success_token, redirect}`, then `sendGetResultEvent(success_token)` (bridge
   `window.parent.postMessage`) then `closeApp({successToken, redirect})`. Behavior:
   - if server `redirect` set → `location.href = redirect + "?success_token=..."`. **The SERVER
     decides this and it comes back empty in practice** — our query param does not set it (the
     query `redirect` only maps to `isOldClient`). So the token never appears in a URL.
   - else if `isOldClient` (query `redirect=1`) → `location.href = "oauth.vk.com/blank.html?success=1"`.
   - else → `bridge.sendCloseEvent()` → **no navigation, HANGS.**

6. **VK forbids framing** the captcha (X-Frame-Options → broken iframe). It must load **top-level**
   in the WebView.

7. **🔑 THE decisive fix — `success_token`, not `captcha_key`.**
   Retrying the grant after a solved captcha only works with the ORIGINAL `captcha_sid` **plus
   `success_token`**. `captcha_key` is for the legacy IMAGE captcha only; sending a not_robot token
   as `captcha_key` silently re-challenges, which is what produced the endless captcha loop
   ("solve → blank.html?success=1 → resume → captcha again").
   Proven live 2026-08-23 against `oauth.vk.com/token`:
   - `captcha_sid + captcha_key=<success_token>` → `need_captcha` ❌
   - `success_token` alone (no sid) → `need_captcha` ❌
   - **`captcha_sid + success_token`** → `access_token` + `secret` ✅
   The `success_token`/`captcha_sid`/`device_id` must all belong to the SAME challenge.

8. **🔑 The captcha widget needs Chromium ≥ 94.** VK's bundle
   (`st.vk.com/vkid/vkid-bff/dist/projects/notRobotCaptcha-web/entrypoints/entry.*.js`) uses ES2022
   (class static blocks). Older WebViews throw
   `Uncaught SyntaxError: Unexpected token '{'` while parsing it, the SPA never mounts and the page
   is **blank** — which reads as "captcha doesn't show" / "app hangs".
   Observed: API-31 emulator ships WebView **91**, an older AVD **66**, Samsung Android 9 similar.
   Same URL in desktop Chrome renders and even auto-passes.
   **Not fixable client-side** — the engine cannot parse the file. The app now detects the version
   and tells the user to update *Android System WebView* instead of showing a blank screen.

9. **Where `success_token` actually is.** It is the response body of
   `POST https://api.vk.com/method/captchaNotRobot.check` →
   `{"response":{"redirect":"","status":"OK","success_token":"eyJ..."}}`.
   The bridge `postMessage` goes to `window.parent`, which for a top-level page is **itself** — an
   opener/parent listener sees nothing. So the reliable capture is **hooking `fetch`/`XHR` inside
   the page**, which only in-app injection can do.

10. **The "dead Log in button" was the keyboard.** After typing the password the on-screen keyboard
    covered the centred submit button, so taps landed on the keyboard. Not a styling or JS problem.
    All self-rendered pages are now **top-aligned**.

11. **2FA is usually NOT an SMS.** For the test account VK answers:
    `validation_type: 2fa_callreset`, `error_description: "use last 4 digits from incoming call"`,
    `validation_resend: "sms"`. VK places a **flash call** and the code is the **last 4 digits of the
    calling number** — waiting for an SMS is futile. Calling
    `auth.validatePhone?sid=<validation_sid>&client_id&client_secret&v` re-delivers and **flips the
    channel to SMS** (verified: response came back `validation_type: "sms"`). VK enforces a
    `delay` (~60 s) countdown; asking earlier just returns the remaining time.

12. **`/auth/local` is an OFFLINE MOCK, not a login.** It ignores the submitted credentials and
    redirects to a canned `DEV_API_TOKEN` from `.env`. Dev mode used to point at it, which is why
    every account "logged in" with an **identical token/secret** and never asked for 2FA, and why a
    plain built-in form appeared instead of the VK page. Not a security hole. Dev now uses the real
    `/auth/vk`; `EXPO_PUBLIC_LOGIN_LOCAL=true` opts back into the mock.

13. **Injected-JS gotcha (self-inflicted, caught by testing).** `CAPTURE_JS` lives in a TS template
    literal, where `\d` collapses to a plain `d`. A regex written there became invalid and threw
    `SyntaxError`, which killed the **entire** injection — including the `success_token` hooks.
    **Rule: no backslash escapes inside `CAPTURE_JS`.** Version parsing uses `indexOf`/`parseInt`.

14. **Stale spinner looked like a hang.** The `busy` overlay is absolutely positioned over the
    WebView and was never cleared when the flow navigated back onto the captcha page, so it covered
    the widget and swallowed taps. Cleared on every `not_robot_captcha` navigation.

15. **THE BIG ONE — the cluster's egress IP is flagged.** Identical http2 request, same account,
    same second:

    ```
    from the pod (kubectl exec … node probe.js)  -> {"error":"need_captcha", …,"captcha_ratio":2.6}
    from a dev machine                           -> {"access_token":"vk1.a.…","secret":…} http 200
    ```

    Both test accounts, reproducible. Every captcha in this document was a *symptom* of where the
    request came from. Worse, it is unwinnable server-side: the not_robot session is minted for the
    server IP but solved on the phone, so `captchaNotRobot.check` keeps answering `BOT`. Fix: the
    grant is delegated to the WebView (see *Current architecture*).

16. **"Widget freezes after the checkbox" is VK saying no, not a hang.** Read from the widget bundle
    (`st.vk.com/vkid/vkid-bff/dist/projects/notRobotCaptcha-web/entrypoints/entry.*.js`):

    ```js
    const {status, success_token, show_captcha_type, redirect} = await requestCheck(…)
    if (status === "OK") { sendGetResultEvent(success_token); closeApp({successToken, redirect}) }
    if (status === "BOT") {
      if (show_captcha_type) { captchaType = show_captcha_type; checkStatus = IDLE }  // silent swap to a slider puzzle
      else                   { checkStatus = BLOCKED }                                // just sits there
    }
    ```

    Navigation *and* the token only happen on `status:"OK"`. Every other status leaves the widget
    inert with nothing on the wire. Our hook only forwarded bodies containing `success_token`, so all
    failure branches were invisible. Now every `captchaNotRobot.*` body is forwarded and decoded.

    Same read confirmed our own params are right: `redirect=1` sets `isOldClient`, which is exactly
    the branch that does `location.href = "https://oauth.vk.com/blank.html?success=1"`; `origin=` is
    not in the widget's param whitelist (`variant, domain, session_token, autofocus, blank, redirect,
    scheme, lang_id`) and is simply ignored.

17. **The UA does not matter.** A plain Chrome-mobile UA gets a token from the token endpoint just
    like `VKAndroidApp/7.7-9034` does (verified). So delegating the grant to the WebView needs no UA
    override — which matters, because overriding it would break the Chromium-version sniff and VK's
    own login page.

---

## Current architecture / flow

**Backend** (`api/src/router/authForm.ts`, `api/src/helper/directGrant.ts`, `api/src/constants/index.ts`):

- `GET /auth/vk` — serves the real VK login page snapshot (`api/docs/auth.html`) with its form
  rewritten to POST `/auth/vk`. Stores `?device_id=` (from the app) in session.
- `POST /auth/vk` — **does not call VK.** It stores creds + device_id in `session.fb` and 302s the
  WebView to the URL from `buildGrantUrl()` (`https://oauth.vk.com/token?…`), so the grant leaves
  from the phone's IP over HTTP/2 (root cause 15). `VK_GRANT_ON_SERVER=true` restores the old
  server-side `performDirectGrant` path; everything downstream is identical either way.
- `GET /auth/vk/next?d=<VK's raw JSON>` — the app hands back what VK answered on the device;
  `parseGrantResponse` turns it into the same `GrantResult` the server grant produced, and it goes
  through the same `finalizeGrant`.
- `finalizeGrant` renders the next step:
  - **ok** → `redirect("/auth/blank.html#success=1&access_token=..&user_id=..&secret=..&device_id=..")`
    (absolute: it fires from `/auth/vk`, `/auth/vk/resume` and `/auth/vk/next`, which would each
    resolve a relative path differently).
  - **need_validation** (2FA) → stores `{sid, type, mask, resend}` in `session.val`, renders the
    confirmation page with per-channel copy (callreset = 4 digits of the incoming call, sms/app = 6).
  - **need_captcha** → stores `captcha_sid` + creds + device_id in `session.fb`, then redirects the
    WebView **top-level** to the VK captcha with `&origin=https://id.vk.com&redirect=1` appended
    (`redirect=1` → navigates to `blank.html?success=1` on solve instead of hanging).
  - **error** → re-renders the login page with a banner.
- `GET /auth/vk/resume?success_token=<token>` — resubmits the grant from `session.fb` (same
  device_id) with the stored `captcha_sid` + `success_token`, delegating to the device the same way.
  Legacy `?captcha_key=` still accepted.
- `GET /auth/vk/validate-resend` — `auth.validatePhone(session.val.sid)` to re-deliver the 2FA code
  (flips callreset → SMS); re-renders the page with VK's `delay` as a live countdown.
- Self-rendered pages (2FA, captcha fallback, errors, `/auth/vk/fallback`) use a **VK-styled shell**:
  light `#edeef0` backdrop, white card, VK logo, blue `#3f8ae0` button — all **inline**, no external
  CSS/JS (VK's own page pulls ~11 stylesheets + 34 bundles, which old WebViews fail on).

**App** (`app/src/app/(auth)/login.tsx`, `app/src/constants/index.ts`):

- Generates a **stable device_id** once (SecureStore `vk_device_id`, 700 ms timeout fallback) and
  passes it to the backend `?device_id=`.
- WebView at `apiUrls.authAppUrl` with:
  - `injectedJavaScriptBeforeContentLoaded` (`CAPTURE_JS`) —
    (a) reports the Chromium version on the captcha page when < 94;
    (b) hooks `fetch` **and** `XMLHttpRequest` for **every** `captchaNotRobot.*` call — bodies with
        `success_token` under tag `xhr`, everything else under `chk` so the `BOT` / `ERROR_LIMIT`
        branches are visible instead of looking like a hang (root cause 16);
    (c) still wraps `postMessage` + a `message` listener as a belt-and-braces channel;
    (d) on `oauth.vk.com/token`, reads VK's JSON out of the page (`document.body.innerText`;
        content-type is `application/json`, so the WebView renders it as text) and sends it as
        `grant`;
    (e) forwards uncaught page errors as `err`.
    **No backslashes and no `${` in this template literal** — see gotchas.
  - `onMessage` —
    `grant` → forwards the JSON to `/auth/vk/next?d=…` (guarded by its own `grantSent` ref, separate
    from `handled` so the token redirect that follows is still accepted);
    `xhr`/`pm`/`msg` → `findToken` (recursive, parses stringified JSON) pulls `success_token` → loads
    `/auth/vk/resume?success_token=<token>`;
    `chk` → decodes `status` / `show_captcha_type`; a non-OK status shows a hint ("solve the puzzle
    above") for `BOT:<type>`, or a "VK не принял проверку" card with a restart button for the dead
    ends (`ERROR_LIMIT`, `ERROR_TOKEN_EXPIRED`, bare `BOT`);
    `oldwv` → the "update WebView" notice.
  - `onShouldStartLoadWithRequest` + `onNavigationStateChange` → `processUrl(url)`:
    - logs `[login nav] <url>`; clears the busy overlay on `not_robot_captcha`.
    - keeps the overlay UP on `oauth.vk.com/token` so VK's raw JSON (token included) is never on
      screen; clears it again when a backend step renders.
    - any url with `access_token=` → parse hash → `signIn` → `router.dismiss()`.
    - `blank.html` + `success=1` → wait 1500 ms for the token (keyed resume wins the race), else a
      keyless resume as a last resort.
- `EXPO_PUBLIC_LOGIN_LOCAL=true` → offline `/auth/local` mock. Only `EXPO_PUBLIC_*` vars are inlined
  by Expo, so an unprefixed name cannot work.

---

## Deployed / published state

- **Backend:** `varg/visky-api:1.5.27` (k8s ctx `oracle`, ns `frisky`, deploy `visky-api`, env from
  secret `visky-api-env`). Deploy with `scripts/build-api.sh --deploy`. CD is NOT automated.
- **App:** EAS `@varg/visky`, pkg `com.envarg.visky`, production profile (app-bundle, auto-submit
  internal track). Last build **vc50** (commit `d2ef5c7`) — contains the `success_token` capture and
  the spinner fix, but **not** the old-WebView notice / dev-routing (`24807c1`), the captcha-status
  diagnostics (`3d8afaf`) or the device-side grant (`17530a3`). Build with `scripts/build-app.sh`.
- **The device-side grant needs BOTH sides shipped together**: the backend redirect is inert without
  an app that knows how to read the JSON back, and vice versa. Deploy the API and cut an app build in
  the same pass, or set `VK_GRANT_ON_SERVER=true` until the build lands.
- git: monorepo `github.com:neoff/visky.git`, all on `main`.

---

## What was verified, and how

- **Grant redemption** — curl against `oauth.vk.com/token`: `captcha_sid + success_token` →
  `access_token` + `secret` (user_id 735655178). The three failing variants are listed in cause 7.
- **Client capture** — a mock page mimicking the widget (same `captchaNotRobot.check` XHR) served to
  the app's WebView on the emulator produced, in `adb logcat`:
  `[captcha bridge] xhr {...success_token...}` → `keyed resume` →
  `[login nav] .../auth/vk/resume?success_token=...`.
- **Old WebView** — reproduced twice on the emulator (`SyntaxError` from VK's bundle, WebView 91) and
  the notice UI verified rendering in its place.
- **2FA page** — driven live against a local API instance: correct callreset copy + phone mask +
  `maxlength=4`; `/auth/vk/validate-resend` returned `validation_type: sms` and the page re-rendered
  as "Код из SMS" with a 60 s countdown.
- **End to end on device** — confirmed working by the user after the `success_token` fix.
- **Flagged cluster IP** (cause 15) — the same http2 grant script run twice, once via
  `kubectl exec … node probe.js` inside the pod and once on the dev mac, for both test accounts:
  pod → `need_captcha` every time, mac → `access_token` every time.
- **Widget freeze** (cause 16) — read directly from VK's captcha bundle (`closeApp` / `checkResult`),
  not inferred: only `status:"OK"` navigates or emits a token.
- **Device-side grant** (`17530a3`) — driven end-to-end against a local API with curl standing in for
  the WebView: `POST /auth/vk` → 302 to `oauth.vk.com/token?…` (device_id preserved) → fetch → JSON →
  `GET /auth/vk/next?d=…` → `302 /auth/blank.html#access_token=…&secret=…`. Also verified per branch:
  synthetic `need_validation` renders the callreset page with `maxlength=4`; synthetic `need_captcha`
  302s to the widget and stores `captcha_sid`, which `/auth/vk/resume` then replays alongside
  `success_token`; a 2FA `code` POST re-delegates with `&code=` appended; unparseable `d` falls back
  to the login page. `CAPTURE_JS` passes `node --check` and contains no backslashes or `${`.
  **Not yet run on a real device** — needs a new app build.

---

## Key facts / gotchas

- Grant MUST be HTTP/2 and cookieless. Token from password grant is non-expiring (`expires_in:0`,
  offline scope) — grant ONCE, then live on `auth.refreshToken` (signed, on `api.vk.com`, NOT
  flood-limited). Never auto-retry the grant in a loop (every attempt extends the flood window).
- Every audio call needs `sig = md5(path + secret)` with the SAME `device_id` from grant time.
- App→api token transport: RN has no cookie jar → app mirrors session into
  `x-auth-token/user/secret/device` headers; `checkAuthAndroid` restores from them.
- A desktop browser CAN solve the captcha (it often auto-passes), but the `success_token` cannot be
  handed back automatically — VK returns an empty server `redirect`, so nothing carries it out of the
  page. Capture requires the app's injected JS. Browser is fine for inspecting, useless as a flow.
- Emulators are a dead end for the captcha: available system images (API 28/30/31) ship WebView
  66–91, and `cmdline-tools` is not installed to fetch a newer image. Test the captcha on a real
  device with an updated WebView.
- `__DEV` in `app/src/constants/index.ts` is `_envDev === "true"`, and `_envDev` may be a boolean
  (`__DEV__`) — a boolean never equals the string, so `__DEV` is only true when
  `EXPO_PUBLIC_DEV=true` is set explicitly. Left as-is; be aware when reading that branch.
- The local `tsx watch` dev server has been observed serving stale code after edits — restart
  `yarn dev` in `api/` if a change does not show up on `localhost:3000`.
- Accounts: `+79169581356` (user_id 735655178) — no 2FA. `en.varg@gmail.com` — 2FA via
  `2fa_callreset` (flash call), phone mask `+358 ** *** ** 94`. Passwords in `api/.env`.
- Related memory: `vk-audio-auth-strategy.md`, `vk-not-robot-success-token.md`.

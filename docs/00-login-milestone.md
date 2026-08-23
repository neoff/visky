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

## Status (2026-08-24)

**The full chain works on a real device:** login → not_robot captcha → `success_token` capture →
grant retry → token + secret → signed in. 2FA accounts reach a working confirmation step.

Remaining constraint: **the WebView must be Chromium ≥ 94** (see root cause 8). Nothing else is
open; the 2captcha fallback was never needed.

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

---

## Current architecture / flow

**Backend** (`api/src/router/authForm.ts`, `api/src/helper/directGrant.ts`, `api/src/constants/index.ts`):

- `GET /auth/vk` — serves the real VK login page snapshot (`api/docs/auth.html`) with its form
  rewritten to POST `/auth/vk`. Stores `?device_id=` (from the app) in session.
- `POST /auth/vk` — runs `performDirectGrant` (HTTP/2). `finalizeGrant` renders the next step:
  - **ok** → `redirect("blank.html#success=1&access_token=..&user_id=..&secret=..&device_id=..")`.
  - **need_validation** (2FA) → stores `{sid, type, mask, resend}` in `session.val`, renders the
    confirmation page with per-channel copy (callreset = 4 digits of the incoming call, sms/app = 6).
  - **need_captcha** → stores `captcha_sid` + creds + device_id in `session.fb`, then redirects the
    WebView **top-level** to the VK captcha with `&origin=https://id.vk.com&redirect=1` appended
    (`redirect=1` → navigates to `blank.html?success=1` on solve instead of hanging).
  - **error** → re-renders the login page with a banner.
- `GET /auth/vk/resume?success_token=<token>` — resubmits the grant from `session.fb` (same
  device_id) with the stored `captcha_sid` + `success_token`. Legacy `?captcha_key=` still accepted.
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
    (b) hooks `fetch` **and** `XMLHttpRequest` for `captchaNotRobot.check` and forwards the body;
    (c) still wraps `postMessage` + a `message` listener as a belt-and-braces channel.
  - `onMessage` — `findToken` (recursive, parses stringified JSON) pulls `success_token` → loads
    `/auth/vk/resume?success_token=<token>`; an `oldwv` message shows the "update WebView" notice.
  - `onShouldStartLoadWithRequest` + `onNavigationStateChange` → `processUrl(url)`:
    - logs `[login nav] <url>`; clears the busy overlay on `not_robot_captcha`.
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
  the spinner fix, but **not** the old-WebView notice / dev-routing (commit `24807c1`) or the
  VK-styled 2FA page (backend-only, already live). Build with `scripts/build-app.sh`.
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

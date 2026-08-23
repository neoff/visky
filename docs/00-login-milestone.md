# 00 — Login / VK audio auth milestone

Full record of the VK authentication rework so the work can be resumed. Written 2026-08-23.

> Credentials are NOT inlined here (avoid committing secrets). They live in `api/.env`
> (`VK_DIRECT_*` + test creds in comments). Accounts referenced below by phone/email only.

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
   - if server `redirect` set → `location.href = redirect + "?success_token=..."` (server decides
     this; our query param does NOT set it — the query `redirect` maps to `isOldClient`).
   - else if `isOldClient` (query `redirect=1`) → `location.href = "oauth.vk.com/blank.html?success=1"`.
   - else → `bridge.sendCloseEvent()` → **no navigation, HANGS.**
   - `success_token` is emitted ONLY via the bridge `postMessage`, and only when `config.origin`
     is truthy (`config.origin && window.parent.postMessage(...)`, origin read from the `origin`
     query param).
6. **VK forbids framing** the captcha (X-Frame-Options → broken iframe). So we cannot host it in an
   iframe on our own page. The captcha must load **top-level** in the WebView.
7. Retry-after-solve WITHOUT the success_token still returns `need_captcha` — the token is
   **mandatory** for redemption (resubmit grant with original `captcha_sid` + `captcha_key=success_token`).

---

## Current architecture / flow

**Backend** (`api/src/router/authForm.ts`, `api/src/helper/directGrant.ts`, `api/src/constants/index.ts`):

- `GET /auth/vk` — serves the real VK login page snapshot (`api/docs/auth.html`, English, no lang
  switcher) with its form rewritten to POST `/auth/vk`. Stores `?device_id=` (from the app) in session.
- `POST /auth/vk` — runs `performDirectGrant` (HTTP/2). `finalizeGrant` renders the next step:
  - **ok** → `redirect("blank.html#success=1&access_token=..&user_id=..&secret=..&device_id=..")`.
  - **need_validation** (2FA) → `smsForm` (posts code back to `/auth/vk`).
  - **need_captcha** → stores `captcha_sid` + creds + device_id in `req.session.fb`, then redirects
    the WebView **top-level** to the VK captcha with `&origin=https://id.vk.com&redirect=1` appended
    (`origin` → widget emits the result postMessage; `redirect=1` → navigates on solve instead of
    hanging).
  - **error** → re-renders the login page with a red banner.
- `GET /auth/vk/resume?captcha_key=<success_token>` — resubmits the grant from `session.fb`
  (same device_id) + `captcha_sid` + `captcha_key`. Feeds back into `finalizeGrant` (→ token, or 2FA).
- `performDirectGrant` — cookieless, `v=5.131` (env `VK_DIRECT_V`), no `force_sms`. Returns
  ok/need_validation/need_captcha(+redirect_uri)/error.

**App** (`app/src/app/(auth)/login.tsx`, `app/src/constants/index.ts`):

- Generates a **stable device_id** once (SecureStore `vk_device_id`, 700ms timeout fallback) and
  passes it to the backend `?device_id=`.
- WebView at `apiUrls.authAppUrl` with:
  - `injectedJavaScriptBeforeContentLoaded` (`CAPTURE_JS`) — wraps `window.postMessage` + a `message`
    listener → forwards every payload to RN.
  - `onMessage` — `findToken` scans the payload for `success_token`; if found → loads
    `/auth/vk/resume?captcha_key=<token>`.
  - `onShouldStartLoadWithRequest` + `onNavigationStateChange` — both call `processUrl(url)`:
    - logs `[login nav] <url>`.
    - any url with `access_token=` → parse hash → `signIn` → `router.dismiss()` (lenient, like the
      original working handler).
    - `blank.html` + `success=1` (no token) → `setUri(authResumeUrl)` (captcha solved → continue grant).
- Fallback button → `authFallbackUrl`.

---

## Deployed / published state

- **Backend:** `varg/visky-api:1.5.23` (k8s ctx `oracle`, ns `frisky`, deploy `visky-api`,
  env from secret `visky-api-env` which has `VK_DIRECT_*`). Deploy = `docker buildx --platform
  linux/amd64 --push` then `kubectl set image` + rollout. CD is NOT automated (workflows not at repo root).
- **App:** EAS `@varg/visky` (projectId db8e9c8f-...), pkg `com.envarg.visky`, production profile
  (app-bundle, auto-submit internal track). Last **published = vc48** (build `a81888b5`, adds
  `[login nav]` / `[captcha bridge]` debug logging), Google Play internal = COMPLETED.
- git: monorepo `github.com:neoff/visky.git`, all on `main`.

---

## Status — what works vs open

**Works / proven:**
- HTTP/2 grant returns token+secret directly on a rested account; `audio.get` → 10000 FRISKY tracks.
- Backend deployed, correct app pair, debug logging present.
- App catches the `blank.html#access_token` success redirect and signs in (lenient handler restored).

**Open / unverified (the captcha path):**
- The `success_token` capture via the injected `postMessage` wrapper is **not yet confirmed on
  device**. Last report: on a **2FA account** (email `en.varg@gmail.com`), after solving the robot
  check the WebView landed on `blank.html?success=1` (query, no `#`, no token — expected captcha
  signal) but the flow did not visibly advance to the SMS-code step. vc48 adds `[login nav]` +
  `[captcha bridge]` logging to diagnose exactly where it stalls.

**Immediate next step (resume here):** install vc48, trigger the captcha, and read console:
- `[login nav] <url>` — confirm the post-captcha URL and that `success=1` resume fires.
- `[captcha bridge] {...}` — confirm the widget emits `success_token` and which field holds it
  (adjust `findToken` if the field name differs — app-side change → vc49).
- If capture works: resume → grant → token (or 2FA `smsForm` for the email account) → sign in.

**If the client-side capture proves too fragile:** the robust universal fallback is a **server-side
captcha solver (2captcha)** — backend detects `need_captcha`, sends `redirect_uri` to 2captcha, gets
`captcha_key`, resubmits the grant. Works in any client (browser + app), no bridge/injection. Costs
pennies for personal use; needs an API key. (User has 3 accounts, so a single hardcoded bootstrap
token was rejected.)

---

## Key facts / gotchas

- Grant MUST be HTTP/2 and cookieless. Token from password grant is non-expiring (`expires_in:0`,
  offline scope) — grant ONCE, then live on `auth.refreshToken` (signed, on `api.vk.com`, NOT
  flood-limited). Never auto-retry the grant in a loop (every attempt extends the flood window).
- Every audio call needs `sig = md5(path + secret)` with the SAME `device_id` from grant time.
- App→api token transport: RN has no cookie jar → app mirrors session into
  `x-auth-token/user/secret/device` headers; `checkAuthAndroid` restores from them.
- A plain browser CANNOT complete the not_robot captcha for our grant (VK blocks framing; the
  success_token postMessage needs interception only possible via the app's injected JS). Browser
  testing of the captcha path is a dead end — test in the app.
- Accounts: `+79169581356` (user_id 735655178) — no 2FA. `en.varg@gmail.com` — HAS 2FA (SMS code).
  Passwords in `api/.env`.
- Related memory: `vk-audio-auth-strategy.md`.

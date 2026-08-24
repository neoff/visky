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

17. **Reading the grant back needs a same-origin hop.** The token endpoint sends no CORS headers
    (`Access-Control-Allow-Origin` absent) and supports no JSONP (`callback` / `jsonp` /
    `format=jsonp` all ignored), so a `fetch` from our own host cannot read the response. A
    top-level navigation to `oauth.vk.com/token` would work, but leaves the raw token rendered on
    screen and depends on how the WebView chooses to display `application/json`.

    Fix: land on `https://oauth.vk.com/blank.html` — a real, empty, CSP-free page on the SAME origin
    — with the grant query in the **URL fragment** (never sent to VK), and have the injected script
    issue `fetch('/token?…')`. Same origin means the body is readable, and the token never appears
    on screen.

    (An earlier revision of this doc blamed a blank `/token` page on the WebView refusing to render
    `application/json`. That was wrong — see cause 18. The same-origin hop is still the right
    design, for the reasons above.)

18. **VK's TLS chain does not validate on Android 9 — and this had been poisoning everything.**

    ```
    *.vk.com  <-  GTS WR1  <-  GTS Root R1        VK sends only the first two
    Android 9 store: 137 roots — GlobalSign x5, DigiCert x8, ISRG x1, Google/GTS x0
    ```

    GTS Root R1 *is* cross-signed by GlobalSign Root R1, but VK does not ship that cross-cert, so an
    old device has no path to build. Every request to `vk.com`, `id.vk.com`, `oauth.vk.com` and
    `api.vk.com` fails with `SSL error: The certificate authority is not trusted` (Android
    `SslError` code 3), and the WebView just shows a blank page. Reproduced on an Android 9 emulator
    in `org.chromium.webview_shell`: `https://example.com` renders, `oauth.vk.com/authorize`
    (ordinary `text/html`) does not.

    This retroactively explains a large slice of this document: on that phone the not_robot widget
    could never load at all, so "white page", "captcha did not appear" and "freezes after the
    checkbox" were partly this, not the ES2022 syntax floor of cause 8.

    Fix: `app/plugins/withVkTrustAnchor.js` bundles the genuine public GTS Root R1 (SHA-256
    `D9:47:43:2A:…:F4:CF`, valid to 2036) and adds it as a trust anchor for **vk.com and vk.ru only**,
    alongside `<certificates src="system"/>`. Validation stays fully on — this supplies a missing
    real root, it does not disable or bypass any check.

    VK's media CDN needs nothing: `*.userapi.com` / `vkuseraudio.net` chain through
    `HARICA DV TLS RSA` to a **cross-signed** `HARICA TLS RSA Root CA 2021` whose issuer is
    `Hellenic Academic and Research Institutions RootCA 2015` — present in Android 9. Audio was
    never affected.

19. **`injectedJavaScriptBeforeContentLoaded` is not actually "before" on Android.** It lands at
    `onPageStarted`, and `oauth.vk.com/blank.html` is a few hundred bytes — by the time the script
    ran, `DOMContentLoaded` had already fired, so neither listener ever did and the grant silently
    never started. The page loaded, and then nothing. Fix: inject on **both** hooks
    (`injectedJavaScriptBeforeContentLoaded` for the fetch/XHR hooks, `injectedJavaScript` for
    timing), keep installation once-only behind `window.__vkcap`, but expose the ready handler as
    `window.__vkready` so the second pass can still run it — plus an immediate call when
    `document.readyState` is already past `loading`, and a 300 ms backstop.

20. **The 2FA resend is a second victim of the flagged IP.** `auth.validatePhone` runs the same VK
    API surface as the grant, so from the cluster it answers **`Captcha needed`** — seen live on the
    2FA page as "Не удалось запросить код: Captcha needed". Since VK often picks `2fa_callreset` and
    the flash call does not always arrive, and the resend is the ONLY way to switch the channel to
    SMS, this left an undelivered call with no way forward at all.

    Delegated to the device like the grant: `/auth/vk/validate-resend` parks the WebView on
    `blank.html#r=<query>` and `/auth/vk/validate-next` takes VK's JSON back. `api.vk.com` sends no
    `Access-Control-Allow-Origin` but **does** answer JSONP, so this one goes out as a `<script>`
    tag rather than a fetch. Both handoffs now match their hash prefix strictly (`#g=` / `#r=`).

21. **The overlay must clear on the handoff page too.** `/auth/vk/next` is the URL that renders the
    2FA form, and it was excluded from the branch clearing `busy`, so the spinner sat over the
    confirmation card — dimmed, swallowing every tap on the code field. Same failure as cause 14,
    one URL further along. `busy` now clears on any `/auth/` navigation; only the grant-capture
    re-arm still skips the handoff URLs.

22. **`setUri()` navigations are invisible to `onShouldStartLoadWithRequest`.** After the captcha,
    `resumeWith()` drives the WebView programmatically, and Android does not report that through
    `onShouldStartLoadWithRequest` — so `processUrl` never saw `/auth/vk/resume` and never cleared
    `grantSent`, which the FIRST grant (the `need_captcha` one) had already set. The post-captcha
    grant — the one that finally carries the token — was therefore received and dropped, and the
    spinner sat forever. The flags are now reset inside `resumeWith`, where a new grant round
    actually begins. Any state keyed off "we navigated somewhere" has this hole; reset it at the
    point of intent, not on the navigation.

23. **A blocked account looks exactly like 2FA.** VK answers `need_validation` for it too, and only
    `ban_info` tells them apart, so the app asked for a confirmation code that could never arrive.
    Seen live on the test account after a day of grant hammering:
    `{"error":"need_validation","error_description":"user has been banned","ban_info":{"message":
    "Your account has been blocked"}}`. Now its own `GrantResult` and a page pointing at
    `vk.com/restore`.

    Operational lesson: repeated password grants against one account get it blocked. Test against a
    throwaway account, and prefer synthetic JSON over live calls when checking response handling.

24. **The UA does not matter.** A plain Chrome-mobile UA gets a token from the token endpoint just
    like `VKAndroidApp/7.7-9034` does (verified). So delegating the grant to the WebView needs no UA
    override — which matters, because overriding it would break the Chromium-version sniff and VK's
    own login page.

---

## Current architecture / flow

**Backend** (`api/src/router/authForm.ts`, `api/src/helper/directGrant.ts`, `api/src/constants/index.ts`):

- `GET /auth/vk` — serves the real VK login page snapshot (`api/docs/auth.html`) with its form
  rewritten to POST `/auth/vk`. Stores `?device_id=` (from the app) in session.
- `POST /auth/vk` — **does not call VK.** It stores creds + device_id in `session.fb` and 302s the
  WebView to `https://oauth.vk.com/blank.html#g=<urlencoded grant query>` (built from
  `buildGrantUrl()`), so the grant leaves from the phone's IP over HTTP/2 (root cause 15) and is read
  back with a same-origin `fetch` (root cause 17). `VK_GRANT_ON_SERVER=true` restores the old
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
- `GET /auth/vk/validate-resend` — re-delivers the 2FA code (flips callreset → SMS). Delegated to
  the device (cause 20) unless `VK_GRANT_ON_SERVER=true`; `GET /auth/vk/validate-next?d=<json>`
  takes the reply and re-renders the page with VK's `delay` as a live countdown.
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
    (d) on `oauth.vk.com/blank.html#g=…`, decodes the fragment and runs the grant itself with a
        same-origin `fetch('/token?…')`, sending the body as `grant`. Falls back to a top-level
        navigation (and reading `document.body.innerText`) only if that fetch throws;
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
    - keeps the overlay UP for the whole grant hop; clears it again when a backend step renders.
    - **bounces** a direct `oauth.vk.com/token` navigation to `blank.html#g=…` itself, so the app
      works against api 1.5.29 (which redirected straight at the token endpoint) as well as 1.5.30
      and the deploy order does not matter. Only from `onShouldStartLoadWithRequest` (before the
      load) and at most once per attempt — re-issuing the grant would be a second attempt against
      VK's flood control.
    - any url with `access_token=` → parse hash → `signIn` → `router.dismiss()`.
    - `blank.html` + `success=1` → wait 1500 ms for the token (keyed resume wins the race), else a
      keyless resume as a last resort.
- `EXPO_PUBLIC_LOGIN_LOCAL=true` → offline `/auth/local` mock. Only `EXPO_PUBLIC_*` vars are inlined
  by Expo, so an unprefixed name cannot work.

---

## Deployed / published state

- **Backend:** `varg/visky-api:1.5.31` deployed and rolled out (k8s ctx `oracle`, ns `frisky`,
  deploy `visky-api`, env from secret `visky-api-env`). Deploy with `scripts/build-api.sh --deploy`
  (add `--no-bump` when package.json is already at the target version). CD is NOT automated.
  Smoke-checked in prod: `POST /auth/vk` → `blank.html#g=…`, `/auth/vk/validate-resend` →
  `blank.html#r=…`, `/auth/vk/next` → 200. **1.5.32** adds the blocked-account page.
- **App:** EAS `@varg/visky`, pkg `com.envarg.visky`, production profile (app-bundle, auto-submit
  to the Play internal track), built with `scripts/build-app.sh`.
  - **vc53** (`055ff92`) — device-side grant + captcha diagnostics, but **no** TLS trust anchor, so
    it still cannot reach VK on Android 9.
  - **vc54 was NOT built**: the EAS account has used up its Free-plan Android builds for the month
    (resets 1 Sep 2026). The equivalent build exists locally instead —
    `app/android/app/build/outputs/apk/release/app-release.apk`, produced with
    `npx expo run:android --variant release` — carrying the trust anchor, the injection-timing fix,
    the overlay fix and the delegated resend. Install with `adb install -r`.
- **The device-side grant needs the APP shipped**: the backend redirect is inert without an app that
  knows how to run the grant, so deploying the API alone kills login outright (that is exactly what
  happened with 1.5.29 at 10:52). `VK_GRANT_ON_SERVER=true` is the escape hatch. The reverse is
  safe — the app handles both the 1.5.29 and the 1.5.30 redirect shapes, so it can ship first.
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
- **Same-origin hop** (cause 17) — the fragment→`fetch('/token?…')` path exercised in a DOM stand-in
  under node: the query round-trips byte-identical and the `{"__cap":"grant"}` message reaches the
  RN side. No CORS headers and no JSONP on the token endpoint: checked with curl.
- **The Android 9 TLS wall** (cause 18) — three independent checks. `org.chromium.webview_shell` on
  the emulator renders `https://example.com` but shows a blank page for `oauth.vk.com/authorize`
  (plain HTML, so not a rendering question); the device's own store, pulled and grepped, holds 137
  roots with **zero** matching `Google`/`GTS`; and `openssl s_client` shows VK serving only
  `*.vk.com` + `GTS WR1`, whose issuer is `GTS Root R1`. On a real device the same failure surfaces
  as `SSL error: The certificate authority is not trusted` in the RN WebView's `onError`.
- **Audio CDN is unaffected** — `vkuseraudio.net`'s chain ends at a cross-signed
  `HARICA TLS RSA Root CA 2021` issued by `Hellenic … RootCA 2015`, and that root IS in the Android 9
  store (confirmed by dumping all three `Hellenic` certs off the device).
- **The trust-anchor plugin** — `npx expo prebuild` produces `res/raw/gts_root_r1.pem` (fingerprint
  unchanged through the copy), `res/xml/network_security_config.xml` scoped to vk.com/vk.ru, and
  `android:networkSecurityConfig="@xml/network_security_config"` on `<application>`.
- **THE WHOLE CHAIN, on Android 9, against the live API.** A local release APK
  (`npx expo run:android --variant release`) on the `Galaxy_Note8` AVD, driven with `adb input`,
  using throwaway credentials so no real account was touched:

  ```
  [login nav] https://visky.envarg.com/auth/vk?device_id=…
  [login nav] https://oauth.vk.com/token?grant_type=password&…
  [login] -> bouncing the grant to same-origin blank.html
  [login nav] https://oauth.vk.com/blank.html#g=…
  [login] grant response from device, len 146
  [login nav] https://visky.envarg.com/auth/vk/next?d={"error":"invalid_client",…}
  ```

  No SSL error — so WebView on Android 9 **does** honour `network_security_config` trust anchors.
  With real credentials the same path yields `access_token` instead of `invalid_client`.
  Note this ran against the deployed api **1.5.29**, exercising the app-side bounce; 1.5.30 only
  removes the extra hop.
- **The captcha branch, on a MODERN WebView.** VK's widget needs Chromium ≥ 94, which no installed
  emulator image had, so a fresh API 34 AVD was created (`VK_API34`, WebView 113) via the official
  `cmdline-tools` from `dl.google.com`. There the widget renders in full and the whole chain runs:

  ```
  [captcha api] settings / componentDone …
  [captcha bridge] xhr {"response":{"status":"OK","success_token":"eyJ…
  [captcha bridge] -> success_token captured, keyed resume
  [login] -> resume WITH success_token
  [login nav] https://oauth.vk.com/blank.html#g=…
  [login] grant response from device, len 983
  [login nav] https://visky.envarg.com/auth/vk/next?d=…
  ```

  On one run the captcha passed with no interaction at all; on another the user ticked the box.
  The final response was `need_validation` + `ban_info` — the test account had been blocked (cause
  23), not a flow failure.
- **The blank.html hop is safe to inject into** — `https://oauth.vk.com/blank.html` returns
  `200 text/html` with **no** `Content-Security-Policy` (checked), so the injected script and its
  same-origin fetch are not blocked.

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

# 06 — Pairing: signing in a screen that cannot log in

Full record of the milestone, so the work can be resumed. Started 2026-09-01.

Milestone 04 shipped a desktop player and a web player that **cannot log in**. VK's audio token
only comes out of a legacy Android password grant, and VK challenges that grant from anything
that does not look like a phone — the cluster's own IP is flagged, which is why the WebView
performs the grant on the device (docs/02). So the phone is the only thing in this project that
can sign in, and every other screen has to be handed the result.

04 closed with "Pairing with the phone is not started". A first pass at it was written after 04
was filed and never documented: the phone drew its own credentials into a QR code and the
laptop's camera read them. This milestone found that direction to be backwards, reversed it, and
built the server side the reversal requires.

The short version: **a QR code is a one-way channel**, and which end holds the session decides
which end holds the camera. Putting the credentials in the code forces the phone to be the screen
and the laptop to be the camera. Reversing it means the code can no longer carry credentials —
the machine drawing it has none — so it carries a pointer, and the session travels the other way
through a rendezvous in the API.

---

## Goal

1. **The screen that wants a session shows the code.** Desktops often have no camera; the good
   camera is the one in your hand, and the phone has to do the login anyway.
2. **The phone scans and sends.** One "Add a device" action, wherever the phone is signed in.
3. **Phone-to-phone too** — a new Android set up from an iPhone that is already signed in,
   without logging into VK twice. Logging in twice is the step that gets an account flagged.
4. **Keep the offline path.** The credentials-in-a-QR route needs nothing from the server, which
   makes it the thing to reach for when the server is the problem.

---

## Part A — Why the direction had to change, and what that costs

A QR code carries data from the screen showing it to the camera reading it. There is no reverse
channel in the code itself. That single fact drives everything else:

| | shows the code | reads it | needs a server |
|---|---|---|---|
| **credentials in the code** | the phone (it has the session) | the laptop | no |
| **pointer in the code** | the laptop (it wants one) | the phone | **yes** |

The first row is what existed. It works, and it is the reason the offline path is kept. But it
puts the camera requirement on the wrong device: half of desktops have no camera, the ones that
do have the worst camera in the room, and holding a phone up to a laptop is awkward in a way that
reads as the app being broken.

The second row is what the user asked for, and the server relay is not a design choice inside it
— it is forced. The machine drawing the code has no session to encode.

**Is relaying the credentials a new exposure?** No, and this was checked before building it. The
app already sends `x-auth-token` / `x-auth-secret` / `x-auth-user` on **every** REST call
(`helper/vk.ts:checkAuthAndroid` restores the session from them), and the API signs every VK
audio request with that secret. The API is already trusted with these values continuously. What
would be new is *durability*, so the rendezvous is deliberately not durable — see Part B.

End-to-end encrypting the payload past the server was considered and rejected. It would need an
AES implementation on the phone that `expo-crypto` does not provide (it gives digests and random
bytes, not a cipher), and hand-rolling a stream cipher to hide a value the same server receives
in a header on the next request is theatre, not security.

---

## Part B — The rendezvous

`api/src/services/pairing.ts` — a `Map` and nothing else.

```
POST /api/pair                  → { pair_id, code, expires_in }   anonymous
GET  /api/pair/:idOrCode/peek   → { name, platform, expires_in }  anonymous
POST /api/pair/:idOrCode/claim  → 200 | 409 | 410                 x-auth-* required
GET  /api/pair/:id              → 204 pending | 200 session | 410 anonymous
```

The two sides are not symmetric, and that asymmetry is the design: the screen that wants a
session is anonymous because it has no credentials yet, and the phone is authenticated because it
has.

**What is deliberately not kept.** A pending pairing lives in the process's memory for three
minutes, is handed out exactly once, and is deleted on the way out. Never Postgres, never Kafka,
never a log line. `GET /api/pair/:id` sets `Cache-Control: no-store` — that body is the account.

**Verified before parking.** `claim` reads the credentials from the headers, not the body, and
runs them through `verifyCredentials` (the same VK check the playback socket uses) before storing
anything. A slot filled with a forged token would sign a browser into nothing and look like our
bug. There is a test that asserts the slot stays *empty* when VK rejects, and another that a
token claiming a `user_id` VK disagrees with is refused.

**One claim, not two.** A second claim returns 409. Silently swapping the account under a screen
that has already been told about the first is the worst possible outcome of a mistyped code.

**The short code.** Eight symbols of Crockford base32 ≈ 40 bits, for the case where the camera
will not focus. The alphabet drops `I L O U` and the parser folds `O→0` and `I/L→1`, because a
code read off a screen and typed back confuses exactly those. Guessing one inside three minutes
is not feasible — and a guess still only gets a session if the phone's owner reads a name and
taps send.

**Bounded.** `MAX_PENDING = 200`, oldest dropped rather than refusing new ones (refusing would
let one noisy client lock everyone out). Per-IP rate limit of 60/minute on the two anonymous
routes. The sweep is lazy, on each call — a `setInterval` would hold the event loop open in tests
and buy nothing.

**Single replica.** `replicaCount: 1` in the chart, so one `Map` is the whole story. During a
rolling update two pods exist for a few seconds and a pairing started on the old one cannot be
claimed on the new one; it expires and the user taps again. **If this ever scales out, this is
the file that has to move onto the playback events topic** — that is the whole migration.

---

## Part C — One scanner, two payloads

`helpers/authTransfer.ts` now describes both codes, and `readAnyCode` tells them apart by
*content*, not by which button was pressed:

- carries `access_token` + `secret` + `user_id` → a **session**; this device receives it;
- carries `pair=` → a **pointer**; this device sends its session to it.

So pointing the camera at either code does the obvious thing, and phone-to-phone falls out for
free: the new phone shows a pointer, the signed-in phone reads it. Same flow as a laptop.

The pointer rides in the fragment of a real URL:

```
https://frisky.envarg.com/player/#pair=<32 hex>&code=<8>&name=<self-declared>
```

A fragment is never sent to a server, so nothing about a pairing appears in an access log — the
same reason the credential payload uses one. It points at the web player because that is a page
that exists: scanned by a phone's own camera app by mistake, it opens something instead of
failing.

The `name` is what the waiting screen calls itself. It is **shown, not trusted** — the
confirmation on the phone is what authorises the handover, and the sheet says plainly that the
other device gets the account until the token expires.

---

## Part D — The camera, and what it costs the build

`expo-camera@57.0.4`, registered in `app.json` with its permission strings. The old native
`AuthQrScanner.tsx` was a stand-in that said "scanning works in the web player"; it is now a real
`CameraView` with `barcodeTypes: ['qr']`.

Three things worth remembering:

- **`onBarcodeScanned` fires per frame** — around sixty times before a hand moves. The first one
  is the only one that means anything; the rest would re-post to an already-filled slot. Guarded
  with a ref, and the scanner is **remounted on an attempt counter**, not on the error message:
  cancelling a confirmation clears the message back to the value it already had, and the camera
  would sit there decoded-out and dead.
- **The permission is asked for on the scanning screen**, not at launch. It is the only feature
  in the app that needs one, and a music player asking for the camera before you have pressed
  anything reads as a shakedown.
- **This needs a new native build.** `NSCameraUsageDescription` and `android.permission.CAMERA`
  are new; verified present via `npx expo config --type introspect`, with the CarPlay entitlement
  from milestone 05 still intact in the same output.

The web target does **not** use it: `AuthQrScanner.web.tsx` keeps its own `BarcodeDetector` /
`jsQR` implementation, so `expo-camera` and its `zxing-wasm` dependency stay out of the web
bundle. Confirmed by grepping the exported bundle.

---

## Part E — Where the buttons ended up

The first cut put a red primary "Add a device" button in Settings and folded "Show my code" away
behind a disclosure. Both were wrong, and the user said so:

- **Red is for the one thing that throws something away.** `colors.primary` is `#fc3c44`;
  **Logout** wears it now, and pairing uses the standard plate.
- **It is a row, not a button**, because it opens onto a list rather than performing an action.
- **"Show my code" stays visible.** It is the only path that needs nothing from the server.

Final shape:

| screen | what it offers |
|---|---|
| `(tabs)/settings/index` | `Devices ›` row, with a count; red Logout below |
| `(tabs)/settings/devices` | everything signed in as this account, read-only, + `Add a device` / `Show my code` / `Copy link` |
| `(auth)/pair` | shows a pointer code and waits; "Other ways" holds the scanner and the paste box |
| `(auth)/welcome` | phone: *Login with Vk* **and** *Sign in from another device*; web: the latter only |

The Devices list reuses the rows "Play on" already builds from `usePlaybackStore` — same sockets,
read-only here. That inherits three open items from milestone 02 verbatim, and this screen is the
first place a user can *see* them: a device with no `Constants.deviceName` shows as "Unnamed
device" (02 #4), a revoked token keeps its socket for up to ten minutes (02 #5), and **devices are
never pruned** — a phone signed in once stays on the list for ever (02 #6). The last one matters
more now than it did: this screen invites the user to read the list and look for something they
do not recognise. It answers "what is signed in as me?", not "where should the sound come out?".
A device swiped away keeps its row until its token expires, which is the point: it is still
signed in, and this is where an unfamiliar one would be noticed.

---

## Verified

- `api`: **141 tests pass**, 13 of them new — 6 on the rendezvous service, 7 on the routes.
  The security-relevant ones by name: a forged token leaves the slot empty (403 + a following
  `GET` still 204); a token claiming the wrong `user_id` is refused; a second claim returns 409
  and the first session is still what gets delivered; delivery happens once and the replayed poll
  gets 410.
- Web bundle exports clean with every new screen in it; `expo-camera` / `zxing` absent from it.
- `npx expo config --type introspect` shows `NSCameraUsageDescription`,
  `android.permission.CAMERA` and `com.apple.developer.carplay-audio` together.
- `tsc` clean over everything touched. Two pre-existing errors remain in `MovingText.tsx` and
  `TrackShortcutsMenu.tsx`; neither file was modified here.

**One full-suite run failed once**, early, and eight consecutive runs afterwards were green. The
failing test's name was not captured. **This is not closed** — if the suite goes red in CI, start
by suspecting the two new files rather than assuming an unrelated flake.

## Not verified

- **No live pairing has ever run.** It needs the API deployed (`/api/pair` does not exist in
  production yet — the web player will say "Could not reach the server to start pairing") and a
  native build carrying the camera permission. Neither was done.
- The camera scanner has not run on hardware at all — not iOS, not Android.
- Phone-to-phone has not been exercised end to end.
- Behaviour during a rolling update (a pairing opened on the outgoing pod) is reasoned about in
  Part B, not observed.

---

## Files

**API**

| file | |
|---|---|
| `src/services/pairing.ts` | the `Map`, the TTL, the one-shot delivery |
| `src/router/api/pair.ts` | four routes, the rate limit, the VK check before parking |
| `src/router/index.ts` | mounts `/api/pair` |
| `src/__tests__/services/pairing.test.ts` | 6 tests |
| `src/__tests__/router/api/pair.test.ts` | 7 tests |

**App**

| file | |
|---|---|
| `src/helpers/authTransfer.ts` | both payloads, `readAnyCode`, Crockford folding |
| `src/helpers/network.tsx` | `openPairing` / `peekPairing` / `claimPairing` / `collectPairing` — outside `apiRequest` on purpose, they care about 204 and 410 |
| `src/components/PairingCode.tsx` | the receiving side: opens a slot, shows it, polls |
| `src/components/PairSender.tsx` | the sending side: scan or type, confirm, claim |
| `src/components/AuthQrScanner.tsx` | real camera (was a stand-in) |
| `src/components/AuthHandoff.tsx` | the three actions on the Devices screen |
| `src/app/(app)/(tabs)/settings/devices.tsx` | new screen |
| `src/app/(app)/(tabs)/settings/index.tsx` | `Devices ›` row, red Logout |
| `src/app/(app)/(tabs)/settings/_layout.tsx` | registers the route |
| `src/app/(auth)/pair.tsx` | now shows a code instead of reading one |
| `src/app/(auth)/welcome.tsx` | pairing offered on the phone too |
| `src/components/DevicePicker.tsx` | `iconFor` / `lastSeenLabel` exported for the new list |
| `app.json` | `expo-camera` plugin + permission copy |

---

## Open, and what to do next

1. **Deploy the API.** Nothing on the pairing path works until `/api/pair` is live. This is the
   only blocker on trying it at all. — *Attempted 2026-09-01 and rolled back; see milestone 07,
   Part C. Production is on 1.5.40, so `/api/pair` still 404s and the desktop app says
   `Could not reach the server to start pairing.`*
2. ~~**Build the app natively**~~ — done 2026-09-01. The permission was missing because `prebuild`
   had never been re-run after the plugin was added; milestone 07, Part A. The scanner opens on a
   real device without crashing.
3. **Then verify, in this order:** laptop shows → phone scans → laptop signed in; the same with
   the typed code; phone-to-phone; and finally the offline "Show my code" path, which should
   still work with the API stopped. — *Still open: the camera streams, but nothing has been read
   through it, and the first two need the API deployed.*
4. **Chase the one failed test run.** See Verified.
5. If replicas ever go above one, move the rendezvous onto the playback events topic — Part B.

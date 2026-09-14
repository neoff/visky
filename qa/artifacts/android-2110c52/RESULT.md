# QA run android-2110c52

commit: 2110c52a5545aef38a37bfa138fd20ee013a6b0d (working tree dirty — see "Build identity")
surfaces: android-emu only (AVD `VK_API34`, serial `emulator-5554`, Android 14 / API 34, override size 1080x1920, density 420)
builds: android versionCode 100 / versionName 1.0.0, package `com.envarg.visky`, debug build already installed (lastUpdateTime 2026-09-14 09:27:52), JS served by Metro over `adb reverse tcp:8081 tcp:8081`
run window: 12:53 – 13:34 device time, 2026-09-14
artefacts: `/Users/varg/Workspace/js-projects/visky/qa/artifacts/android-2110c52/`

## Build identity — read this before trusting a row

The APK is the committed build, but **the JavaScript under test is the working
tree, not the commit**: this is a debug build driven by Metro, and `app/src` has
two uncommitted files — `app/src/constants/index.ts` (base-url resolution:
`EXPO_PUBLIC_API_URL` now wins over the `10.0.2.2` fallback in dev) and
`app/src/services/watch.ts`. `colors.primary` is unchanged at `#fc3c44`, which is
what `qa/lib/pixels.py` matches on, so the C2 measurement is unaffected.

The app talks to **`https://visky.envarg.com`** — the production API. There is no
local API on port 3000 (checked: nothing listening). This is what blocks C5/C6.

Session: signed in as user `1127108627`, device `edfjniaetzl6jypd`.

## Outcomes

| case | surface | outcome | evidence |
|------|---------|---------|----------|
| A1 | android-emu | pass | `==window songs-window: seeded 49 tracks from cache` (12:55:12.956 and again 12:56:03.404); rows painted in `screenshots/android-A3-t9.png`. Caveat: paint is slow on this Metro debug build — see Notes. |
| A2 | android-emu | blocked | needs a fresh install / signed-out app; the only emulator carries the session every other case depends on, and re-login needs VK credentials + captcha I cannot supply. See Asks 1. |
| A3 | android-emu | pass | force-stop + relaunch at 12:56:02; `'--AppLayout=Stack session:', '1127108627'` at 12:56:03.026, songs list at `screenshots/android-A3-t9.png`; no welcome copy in any of the 12 frames `android-A3-t1..t12.png` |
| B1 | android-emu | pass | `pages 0,1 -> 98` → `0,1,2 -> 148` → `0,1,2,3 -> 197` → `1,2,3,4 -> 198` → `2,3,4,5` → `3,4,5,6` → `4,5,6,7 -> 197`; N never exceeds 198 ≤ 4×50. `logs/observed-lines.md` |
| B2 | android-emu | pass | first index decreased 3→2 at 13:04:34.968; `screenshots/android-B2f-pre.png` → `android-B2f-post.png` best-match vertical shift **632 px** against a 600 px drag (residual 399 vs 186048 for the next-best shift). A page is ~9150 px of rows, so nothing jumped. Deviation noted below. |
| B3 | android-emu | pass | log cleared, then `qa_android_pull_to_refresh` → `==window songs-window: pages 0 -> 49 tracks` (13:08:31.013); spinner visible in `screenshots/android-B3c-during.png` |
| B4 | desktop | n/a | desktop-only case |
| B5 | android-emu | pass | `GET .../playlist/frisky?count=100&offset=0&q=Hypnology` (13:09:55) and `screenshots/android-B5b-search.png` showing hits dated 06.09.2026, 03.08.2026, **05.07.2026** — the loaded window was page 0 only (49 tracks from 13.09.2026), and even a four-page 197-track window only reached back to 15.08.2026 (`android-B2f-pre.png`) |
| C1 | android-emu | pass | third row = "Spectrum September 2026" (`android-C1-before.png`); after the tap `Track changed 29` then `Track changed 0` (queue rebuilt with the tapped track at index 0) and the mini player reads "Spectrum September 2026" (`android-C1-after.png`) |
| C2 | android-emu | pass | `pixels.py android-C2-b1.png android-C2-a1.png` → `grew: true`, exit 0: fill **502 px → 550 px** (row 1757, left edge 21) over 173 s of real playback, 13:12:04 → 13:14:57 |
| C3 | android-emu | pass | tap 13:15:11.506 → `Track changed 1` + `loading`/`buffering`; spinner arc over the dimmed mini-player artwork in `android-C3-k2/k3/k4.png` (280/383/359 near-white px in the artwork box vs **0** in the steady frame `android-C2-a1.png`); `Playback state: playing` at 13:15:14.201 and the artwork is clean again in `android-C3-after-playing.png` |
| C4 | android-emu | blocked | the `==prefetch` half of the proof cannot be obtained on a healthy hand-over — see Failures |
| C5 | android-emu | blocked | cannot poison one link without editing product code or a server I do not control — see Failures |
| C6 | android-emu | blocked | same as C5 |
| C7 | android-emu | pass | `files/played-C7-baseline.bin` (141 B, `["-42311167_456263752"]`) → after "Waves Part 2" ran out at 13:20:26 → `played-C7-after-end2.bin` (263 B, `[...752","-42311167_456263753"]`), exactly one new key; then "Dark to light September 2026" **skipped at 30:10 of 59:57** (`android-C7-skip-midpoint.png`) → `played-C7-after-skip.bin` unchanged at 263 B, same array |
| C8 | android-emu | pass | active track was index 22 of a 23-track queue (`Track changed 22`, 13:31:54); it ran out → `Playback state: ended` 13:32:32.865 with **no** following `Track changed`; `played-C8b-baseline.bin` (429 B) → `played-C8b-after.bin` (639 B) gained `-42311167_456263791` |
| D1 | iphone-xs | n/a | Siri on a physical device |
| D2 | build artefact (iOS) | n/a | iOS `.app` Info.plist check |
| D3 | build artefact | n/a | not this surface. Incidental observation only: `app/android/app/src/main/res/values/strings.xml` has `app_name = visky`, and `AndroidManifest.xml` uses `android:label="@string/app_name"` — no bare "Frisky" and no "Frisky Radio". Not run as a case. |
| D4 | android-emu | pass | from the launcher, `cmd package resolve-activity -a MAIN -c LAUNCHER com.envarg.visky` → `com.envarg.visky/.MainActivity`; `qa_android_assistant_open` → `mCurrentFocus=Window{7d2d34f u0 com.envarg.visky/com.envarg.visky.MainActivity}`, `android-D4-foreground.png`. Label matched by Assistant is `visky`. |
| E1 | android-emu + iphone-xs | blocked | needs playback started on the XS — see Asks 2 |
| E2 | android-emu | blocked | the picker offers exactly one device and it is this one — `android-E2-picker2.png` shows "Play on → sdk_gphone64_arm64 (this device) — Playing here". Nothing to transfer from. See Asks 2. |
| F1 | ios-sim, android-emu | blocked | not shippable from this surface: the build is a Metro debug build and every frame carries the "Open debugger to view warnings" banner, which `qa/SCREENSHOTS.md` explicitly forbids; also this AVD renders **1080x1920**, not the 1080x2400 the doc assumes for the Play phone set. Needs a release build. |

## Failures

Nothing behaved wrongly in this run. Three cases could not be proved on their
own stated evidence; each is below with what was and was not obtained.

### C4 — the automatic hand-over does NOT spin (blocked)

**Expected**: `==prefetch` earlier in the log, and no spinner in the screenshot at
the track change.

**What happened**: the no-spinner half is proved. Log cleared at ~13:16:0x, the
track seeked to `-00:41` (`android-C4-seek1.png`), then 60 screenshots taken back
to back across the change. The hand-over is at 13:16:55.956:

```
09-14 13:16:55.956 I ReactNativeJS: 'Track changed', 2
09-14 13:16:56.046 I ReactNativeJS: 'Playback state: ', 'loading'
09-14 13:16:56.047 I ReactNativeJS: 'Playback state: ', 'ready'
09-14 13:16:56.048 I ReactNativeJS: 'Playback state: ', 'playing'
```

loading → playing in **92 ms with no `buffering`** (compare the manual skip in C3:
2.4 s with `buffering`). Frames `android-C4-k01.png` (started 13:16:55.892, i.e.
before the change) through `k12` and on to `k60` are byte-for-byte identical in
the mini-player artwork box — mean 191.0, 3225 near-white px in every single
frame. No dim, no spinner, at any point.

**What is missing**: there is no `==prefetch` line, and there cannot be one. In
`app/src/services/prefetch.ts` the successful warm path is silent: the only
`==prefetch` lines are `refreshed the stale link for` (fires only when the link
answered 4xx) and `could not refresh` / `warm-up failed` (error paths). With
`LEAD_SECONDS = 90` the warm-up certainly ran inside the cleared window — the seek
put the position inside the lead immediately — and it ran successfully, which is
exactly why it printed nothing.

So the case as written can only pass when the next link happens to be stale.
Making it provable needs a log line on the happy path, i.e. a change to
`app/src/services/prefetch.ts`, which I have not made. **Reproduced**: the same
silence across two automatic hand-overs in this session (13:16:55 and 13:20:26).

### C5 / C6 — poisoned next link (blocked)

Neither route in `qa/lib/poison.md` is open here.

* **Route 1 (local API, dead url) — unavailable.** Nothing is listening on port
  3000, and the app is pointed at `https://visky.envarg.com` (seen on every
  request, e.g. `GET https://visky.envarg.com/api/playlist/frisky?count=50&offset=0`).
  Redirecting it would mean editing `app/.env` (a protected secret file) and
  restarting Metro, and poisoning one entry would mean editing the playlist route
  in `api/src` — product code. Rule: product code is not mine to change.
* **Route 2 (iptables) — technically available, but it does not reproduce the
  case.** `adb root` succeeds on this image (`uid=0(root)`) and
  `/system/bin/iptables` exists, so the CDN could be cut. But the case's premise is
  *one* dead entry while the rest of the archive is fine: recovery re-signs the
  failed track via `resign()` and plays the fresh url, which points at the **same**
  CDN. With the CDN blocked, `playback continues within 10 s` can never be
  observed, so the second half of the proof is unreachable by construction. I did
  not run a half-poison and dress it up as the case.
* **Route 3 (wait for a real expiry)** needs a queue over an hour old and is not
  reproducible on demand.

C6 (`==recovery: giving up on <key>` after three poisonings) depends on the same
poison and is blocked for the same reason.

### B2 — deviation in how the proof was captured (still pass)

The matrix asks for "two screenshots around it showing the same track title at
**the same height**". The prepend lands *during* the drag — measured: the fetch
completes ~1 s before `input swipe` even returns, and screencap needs ~230 ms, so
no frame exists between "gesture finished" and "page prepended". What was captured
instead is the stationary frame before the triggering drag and the stationary
frame after it, and the displacement between them measured by row-signature
correlation: **632 px**, against a 600 px drag. A prepended page is 49 rows of
~187 px ≈ 9150 px. The window held the content; it moved by the finger and nothing
else. Files: `android-B2f-pre.png`, `android-B2f-post.png`.

## Notes worth carrying forward

* **Cold-start paint is slow on this build.** A1 asks for a screenshot within 2 s
  of the first frame. Measured over two launches: splash at +2 s, black at +3..+7 s,
  a white frame at +9 s, the list at +11 s — while `seeded 49 tracks from cache`
  is logged at +4 s. That is a Metro debug build fetching its bundle, not
  necessarily the release behaviour, but the 2 s in the case is not achievable here.
* **`adb logcat -d` lags `logcat -c`.** Greps run within ~1 s of an action came
  back empty and the same grep 3 s later returned the line. Every result here was
  read after a settle, never from the first empty grep.
* **The AVD is 1080x1920**, not the 1080x2400 in the run brief. All tap
  coordinates were taken from real screenshots, so nothing is affected, but F1's
  Play phone-set assumption is.
* The emulator was put into `adb root` to test the iptables poison route and put
  back with `adb unroot` at the end of the run.
* The screenshot set was pruned of near-duplicate burst frames (C4 k13–k59 except
  k20/k40/k60, and the B2 exploratory series) — 103 MB down to 33 MB. Every frame
  named in this table is present.
* Log excerpts: `logs/observed-lines.md`. They were read live from
  `adb logcat -d -s ReactNativeJS:V` as each case was driven; the device ring
  buffer has since rolled, so that file is the record.

## Asks

1. **A2 — signed-out launch (any Android device or this emulator).**
   Only do this when you are willing to log back in.
   `adb shell pm clear com.envarg.visky` then
   `adb shell am start -n com.envarg.visky/.MainActivity`, screenshot within 5 s.
   Pass = the welcome copy of `(auth)/welcome` is on screen and no `Unable to`
   warning is in `adb logcat -s ReactNativeJS:V`. Then sign back in — this run's
   session is the only one on the emulator.
2. **E1 and E2 — remote session and transfer.** Needs the physical iPhone XS,
   which cannot be tapped from here.
   a. On the XS, open visky and start any track; leave it playing.
   b. On the emulator, bring the app to the front and screenshot the mini player.
      E1 passes if it reads "Playing on <the XS>" and the divider advances with
      the remote position.
   c. On the emulator, tap the cast glyph in the mini player (≈ x 800, y 1683) and
      pick `sdk_gphone64_arm64 (this device)`.
      E2 passes if `adb logcat -s ReactNativeJS:V` shows `==playback:` transfer
      lines, sound comes out of the emulator, and the "Playing on" label is gone.
3. **C5 / C6 — decide how you want the poison provoked**, then I can run them:
   either (a) run `api/` locally and give me a QA-only fixture route that serves
   one dead url — a fixture under `qa/` rather than an edit to `api/src` — plus an
   `EXPO_PUBLIC_API_URL` pointing the emulator at it; or (b) accept that these two
   cases only run against a local API and mark them so in the matrix.
4. **C4 — the case needs a hook that does not exist.** Either add a log on the
   successful warm path in `app/src/services/prefetch.ts` (one `console.debug`
   after `warm()` returns), or reword the case's proof to what the build can
   actually show: `loading → playing` with no `buffering` and no spinner across the
   change. I have not touched the file.
5. **F1 — store frames need a release build.** The debug banner is in every frame
   and the AVD is 1080x1920. Give me a release APK (or an AVD at 1080x2400) and
   the Play phone set can be shot.

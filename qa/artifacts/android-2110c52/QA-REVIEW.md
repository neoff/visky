# QA review of run android-2110c52

verdict: do-not-ship
run commit: 2110c52a5545aef38a37bfa138fd20ee013a6b0d   reviewed: 26 cases   unproven: 3 (+8 attested-only)   uncovered: 10   unrun: 3

Reviewed against `qa/TESTCASES.md` at HEAD (b99ec00), which is the contract now,
not the copy that existed at 2110c52. Applied `--strict`: this is the gate
before a store release, so a case nobody can check counts as a case that failed.

What was re-derived rather than read:

* `python3 qa/lib/pixels.py .../android-C2-b1.png .../android-C2-a1.png` →
  `before.count 502` (row 1757, left 21), `after.count 550`, `grew: true`,
  exit 0. **The C2 number is exactly as reported.**
* B2's 632 px was re-derived by the previous review pass and found correct.
* Every `played-*.bin`: md5'd and dumped. The arrays are as reported and the
  chain is consistent — `C7-after-end`, `C7-after-end2`, `C7-after-skip` and
  `C8-baseline` are the *same file* by md5 (`703dfbfe…`), which is what proves
  the skip added nothing.
* Screenshot claims spot-checked by eye: C3's spinner, C4's clean artwork,
  C7's `30:10 / -29:47`, C8b's `60:25 / -00:00`, B3c's spinner at page 0,
  E2's one-device picker, B5's date span. All present and as described.

## Unproven claims

| case | claimed | what the evidence actually shows |
|------|---------|----------------------------------|
| A1 | `pass` — "cold start paints the cached list", screenshot within 2 s | The two frames actually taken at the stated times contradict it. `android-A1-coldstart-2s.png` is the **splash**; `android-A1-coldstart-8s.png` is a **black frame with nothing but the status bar**. The row cites `android-A3-t9.png` — a frame from a different case, taken at **+11 s**. The `==window songs-window: seeded 49 tracks from cache` half is attested; the screenshot half is not, and the report's own Notes concede "the 2 s in the case is not achievable here". A case whose proof is "rows, not an empty screen, within 2 s" cannot be passed with a black screen at 8 s. |
| B2 | `pass` — 632 px shift, "residual 399 vs 186048 for the next-best shift" | The matrix's proof — "two screenshots around it showing the same track title at **the same height**" — was never captured, and the report says so. The substitute is a row-signature correlation whose number **no committed tool can produce**: `qa/lib/` holds `pixels.py`, `android.sh`, `ios.sh`, `cdp.mjs`, `poison.md`, and none of them measures a vertical shift. The figure was re-derived once, by hand, by a reviewer; it cannot be re-derived by the next one. |
| C3 | `pass` — "280/383/359 near-white px in the artwork box vs **0** in the steady frame" | The spinner is real: `android-C3-k2.png` shows a white arc over a dimmed cover, and `android-C2-a1.png` shows a clean one. But the "artwork box" is never given coordinates and no script in `qa/lib` computes near-white counts, so the number that turns the observation into a measurement is unreproducible. The claim survives inspection; the evidence as cited does not survive audit. |

**And a systemic one, worse than any single row.** Eight passes — A3, B1, B3,
B5, C1, C7, C8, D4 — rest entirely on log lines. The kept log,
`logs/reactnativejs-buffer-end-of-run.log`, is **0 bytes**. The only record is
`logs/observed-lines.md`, a hand-transcribed excerpt whose own preamble says the
device ring buffer has rolled. Nothing in this run can be re-grepped by anyone.
I could not falsify a single one of those eight lines, and that is the problem:
neither could anyone else. The harness has to `adb logcat -d > file` per case
and keep the file, not paste the interesting lines into Markdown.

Corrections of fact, not findings: the `played` "file sizes" (141/263/429/639 B)
are not file sizes — every `.bin` is 4096 B on disk. They are the MMKV
content length from the header plus its own 4 bytes (137/259/425/635). The
numbers are right about what changed; the units in the report are wrong.
`files/played-C7-baseline.keys` is a 0-byte file that proves nothing and should
not be in the set.

## Failures worth blocking on

**1. The recovery path has never run on a device. C5 and C6 are blocked on the
one surface the matrix says they run on.** `app/src/services/recovery.ts` is the
code that keeps a show going when a VK link has aged out — the defect it was
written for is "the track ended, the next one refused to load, and nothing on
screen said why". It has a unit test
(`app/src/__tests__/services/recovery.test.ts`) and **zero** runtime evidence.
Rule 3 applies literally: these are `android-emu` cases blocked on `android-emu`.

The reasoning given is honest about route 2 — recovery re-signs through
`resign()` and the fresh url points at the same CDN, so cutting the CDN with
iptables makes "playback continues within 10 s" unobservable by construction.
That is a good argument and I accept it. Route 1 is weaker: "poisoning one entry
would mean editing the playlist route in `api/src` — product code" is a
**self-imposed scope rule, not a physical block**, and the run's own Build
Identity section notes the working tree had already changed
`app/src/constants/index.ts` so `EXPO_PUBLIC_API_URL` wins in dev — i.e. the
redirect the poison needs was already in place. The harness is missing a
QA-only fixture route; that gap is the finding. Either way the consequence for
shipping is identical: a listener whose next link died gets silence, and nothing
in this run says otherwise.

**2. C4 was unprovable at 2110c52 and is provable now, and nobody re-ran it.**
The block was correct at the time — the success path in
`app/src/services/prefetch.ts` printed nothing, so "`==prefetch` earlier in the
log" could only ever appear when the link happened to be stale. Commit
**f027365** added exactly the missing line:

```
console.debug('==prefetch: warmed', key, `${Math.round(duration - position)}s before the hand-over`)
```

So the warmed hand-over — the thing that makes a Part 1 → Part 2 change
inaudible, and the whole reason `prefetch.ts` exists — is still untested on a
build where it can be tested. The no-spinner half was well proved
(`android-C4-k01..k60`, loading→playing in 92 ms with no `buffering`); the
warmed half has never been observed. Re-running C4 is a five-minute job and it
is the cheapest pass on this list.

**3. E3 is a layout defect that was seen, fixed, and never verified — and the
artefact named for the fix does not contain the thing it is named after.**
`qa/artifacts/screenshots/ios-appstore-4-devices.png` is the failure in plain
sight: "Sound output" is printed **over the clock and the Dynamic Island**, and
the roster runs off the bottom of a 6.9" screen with no scroller. b99ec00 caps
the sheet. The only artefact that could show the fix,
`qa/artifacts/screenshots/ios-release-picker-fix.png`, **shows the Songs list
and a mini player — there is no picker in it at all.** The fix for a defect
that reaches the status bar on the largest shipping phone is entirely unproven,
and the file name says otherwise.

That same screenshot is also E4 failing exactly as the matrix predicts:
`visky-shot-69` appears three times, `Chrome` three times, `iPhone` twice, and
the tail is 8d and 12d stale. E4 is marked "expected to FAIL today", so that is
recorded rather than blocking — but it is recorded **nowhere in any RESULT.md**.

**4. Three cases in the current matrix have no row in any report: A4, E3, E4.**
They were added after the run commit, so the run is not at fault — but the gate
is. A4 is a known black-screen on an unreadable keychain; on a real phone that
is a dead app, and `qa/artifacts/screenshots/ios-shot69-after-keychain.png`
exists with no result attached to it.

**5. F1 — the store gate — is blocked, and at HEAD it still cannot pass.**
The block was honest for the run: `android-B3c-during.png` and every other
frame carry "Open debugger to view warnings", which `qa/SCREENSHOTS.md`
forbids outright. A release build exists now, and store frames with it. They
still do not satisfy F1:

* `qa/artifacts/store/android/` has **4 of the 6 required frames** (no
  Favorites, no docked-mini-player); `qa/artifacts/store/ios/` has **2**.
* Frame 6 is specified as "the device picker, **mid-transfer**".
  `store/android/04-devices.png` shows a picker with **one** device reading
  "Playing here" — nothing to transfer to, which is the same emptiness
  `SCREENSHOTS.md` says never to ship.
* **No feature graphic** anywhere. Play requires 1024 × 500 and
  `SCREENSHOTS.md` says nothing in the pipeline produces it.
* **No iPad 13" set**, while `app/app.json` has `ios.supportsTablet: true` —
  the doc itself calls that "not optional: shoot it, or drop iPad".
* F1's own proof text points at `qa/artifacts/screenshots/`; the frames now live
  in `qa/artifacts/store/`. The case is stale about where to look.

## Not covered by any case

Walking `git diff 2110c52..HEAD -- app/src api/src` (24 code files, ~942
insertions) and the feature surface:

1. **Device revocation — `app/src/services/revocation.ts`, `components/DeviceRow.tsx`,
   `api/src/services/devices.ts`, `api/src/ws/hub.ts`, migration
   `1757000000000-DeviceRevocation.ts`.** Shipped in 390621f ("sign another
   device out, and make it stick"). It has a unit test
   (`app/src/__tests__/services/revocation.test.ts`, 126 lines) and **no runtime
   case at all**. The needed case: sign a second device out from Settings →
   Devices, prove the revoked device stops playing and cannot resume — the
   "and make it stick" half is a websocket round trip that a Jest mock cannot
   exercise. Section E is the home for it.
2. **`app/src/services/playbackSync.ts` and `app/src/types/playback.ts`** were
   changed after the run. The only cases that touch remote transfer are E1 and
   E2, and **both are blocked**, so the transfer path has never been observed
   end to end. E2's block is honest — the picker genuinely offered one device
   (`android-E2-picker2.png`) — but a case that can only pass when a second
   human-held phone happens to be playing is a case that will be blocked every
   time. Register a synthetic device through the API so the picker has a target.
3. **`app/src/services/watch.ts` — cover art on the wrist (aa9e84a).** No case
   in any section. It was also one of the two uncommitted files during this run,
   so the JS under test was not even the committed version. Nothing verifies
   what the watch shows.
4. **`app/src/components/PullToRefresh.web.tsx`.** B4 exists and is `n/a` on
   every surface this run touched; it has never been run on `desktop`. Its only
   coverage is `app/src/__tests__/components/PullToRefresh.test.tsx`, which
   exercises the wheel accumulator, not the reload. The desktop shell moved to
   Tauri (9d82fb5) and no QA run has ever driven it.
5. **`app/src/store/trackSwitch.tsx` — the `STUCK_AFTER_MS = 20_000` escape
   hatch.** C3 covers the happy path (spinner up, spinner down when
   `Playback state: playing` arrives). Nothing covers the path the timer exists
   for: a switch that never resolves. If that timer regresses the user gets a
   spinner that never stops, and every case in the matrix still passes.
6. **`app/patches/react-native-track-player+4.1.2.patch` (689 lines).** Two
   behaviours are patched in and neither has a case: the Android
   `IMPORTANCE_FOREGROUND_SERVICE` guard in `MusicModule.kt` (which exists to
   stop a crash when playback is started from the background), and the web
   `Player.preload` / `PlaylistPlayer` hooks that `prefetch.ts`
   `parkWithThePlayer` calls through `globalThis.rntpPlayer`. A patch to a
   dependency is the first thing a version bump silently drops. Needed: start
   playback from a background intent on `android-emu`; and a desktop/web case
   that proves `preload` was actually adopted at the hand-over.
7. **Sign-in and VK 2FA.** e231708 ("force VK onto SMS 2FA, and make the code
   field readable") changed `api/src/router/authForm.ts`, and that file is
   **modified in the working tree right now**. The matrix has **no case that
   signs in** — A2 stops at the welcome screen, A3 assumes a session already
   exists. The single most common first-run path in the app is untested.
8. **The splash screen and the app icon, against the registered mark.** See the
   next section — D3 exists and is blind to it.
9. **Version consistency across the monorepo.** d696c67 and
   `scripts/sync-version.sh` (105 lines) make one version flow from the api to
   `app.json`'s `versionCode` / `versionName` and the desktop shell. A store
   upload fails, or worse succeeds with the wrong build number, when that
   drifts. No case asserts it. It is a build-artefact check like D2/D3 and
   belongs beside them.
10. **The signed-out welcome copy as App Review will read it.** A2's proof is
    "the screenshot shows the welcome copy" — it does not ask what the copy
    says. `ios-shot69-launch.png` is the first screen a reviewer sees and it
    reads "This experience will cover courtship, sex, commitment, fetishes,
    loneliness, vindication, love, and hate." That is an age-rating and
    review-risk surface with no case attached to it, on the run that is
    supposed to gate a store release.

## Cases that cannot prove their claim

* **D3 — "the registered mark itself is never claimed". This case passes while
  the app is in breach of it.** Its proof is a grep of `Info.plist` and
  `AndroidManifest.xml`. `app/assets/splash.png` — the launch screen configured
  in `app/app.json` via `expo-splash-screen` — is **the station's X logo, the
  word FRISKY in their wordmark, their tagline "feelin' frisky?", and "Powered
  by: VK"**. It is visible on every cold start; it is in
  `android-A1-coldstart-2s.png` in this very run's artefacts, and the same logo
  is inside the app on the welcome screen. The case text says the mark must
  appear "not anywhere", and then checks two XML files. A grep cannot read a
  PNG. **Fix the proof**: assert on `app/assets/splash.png`, `icon.png`,
  `adaptive-icon.png` and every shipped store frame, not just the plists —
  by checksum against approved art, since the check has to survive an asset
  swap. This is the finding with the largest blast radius on this page: App
  Review reads metadata and screenshots as carefully as the app name, and the
  whole D-section argument is that the pairing is fine and the mark is not.
* **A1 — 2 s is a budget no debug build can meet, and the case does not say so.**
  Measured here: splash +2 s, black +3..+7 s, white +9 s, list +11 s, while
  `seeded 49 tracks from cache` logs at +4 s. The case gave the runner a choice
  between a false `fail` and a padded `pass`, and it got the padded one. Rewrite
  the proof as: `seeded N` with N > 0, **and** the first non-splash frame shows
  rows, **and** time-to-first-row recorded as a number against a stated budget
  per build type (debug vs release). A release build now exists — re-run it there.
* **B2 — asks for a frame that cannot exist.** The prepend lands during the
  drag: the fetch completes ~1 s before `input swipe` returns and `screencap`
  needs ~230 ms, so there is no moment between "gesture finished" and "page
  prepended" to photograph. The displacement measurement the runner substituted
  is the right idea and it does discriminate the failure (632 px of finger
  against ~9150 px for a prepended page). Make it the case, and **commit the
  script** — `qa/lib/rowshift.py <pre> <post>` printing the best-match shift and
  the residual, so the number is reproducible instead of attested.
* **C2 — cannot tell a progress bar from a seek.** "The filled width in the
  second screenshot is strictly greater" is satisfied by anyone dragging the
  scrubber, and this run's own C2 series contains `android-C2-seeked.png` taken
  4 s before the `before` frame. Nothing rules out a second seek between the
  two. Require **three** samples with the elapsed wall-clock recorded, and
  assert the fill rate is consistent across both intervals — a seek breaks
  monotonic rate, playback does not.
* **C4 — the proof was impossible when the case was written; now it is not.**
  At 2110c52 `prefetch.ts` was silent on success, so `==prefetch` could only
  appear when the link was stale — the case could only pass when the feature was
  partly failing. f027365 fixed the code, not the case. Update the case to name
  the line it now expects: `==prefetch: warmed <key> <n>s before the hand-over`,
  and keep the runner's second observation as a corroborator —
  `loading → playing` with no `buffering` and no spinner across the change.
* **C6 — "poison the same entry three times in a row" will fail for the wrong
  reason.** `recovery.ts` counts attempts against `ATTEMPT_WINDOW_MS = 5 * 60_000`;
  outside five minutes the counter resets and `==recovery: giving up on <key>`
  never fires. The steps must say "three times **within five minutes**", or the
  case will report a defect that is the documented design.
* **C1 — title-match cannot tell id-resolution from index-resolution.** The
  claim is "the queue is rebuilt from the tapped track, **by id, not by index**".
  The proof is a matching title in the mini player, which an index-based
  implementation satisfies whenever the two happen to agree. Assert on the
  track key in the log instead — `trackKey` already exists and the run's own
  `played` files show the format (`-42311167_456263752`).
* **E1 / E2 — as written they can only ever be blocked in an automated run.**
  Both require a second physical device that the harness cannot conjure, so
  every run will produce the same honest block and the transfer path will stay
  untested forever. Register a synthetic device via the API (the roster in
  `ios-appstore-4-devices.png` proves the API is happy to carry ghosts) and make
  the proof the `==playback:` transfer lines plus the label clearing.

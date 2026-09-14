# visky — test case matrix

The scenarios the app is expected to survive, written so a machine can run them
and a human can argue with them. Every case says WHAT IS BEING CLAIMED, HOW to
provoke it, and WHAT PROVES it — a log line, a file on the device, or a pixel.

Two rules keep this honest:

* **A case with no observable proof is not a case.** "Looks right" is not an
  outcome; `==recovery: restarted` in logcat is.
* **A case that cannot run on a surface is marked `n/a` for that surface, not
  quietly skipped.** The iOS simulator accepts no synthetic touches (see
  `qa/lib/ios.sh`), so on that surface the deep-link route is the only driver
  and anything needing a tap is `n/a` — it runs on the Android emulator and on
  the physical iPhone instead.

Surfaces:

| id | what | drives input | reads state |
|----|------|--------------|-------------|
| `android-emu` | Android emulator (AVD `VK_API34`) | `adb shell input` | `adb logcat`, `adb pull` |
| `ios-sim` | iOS Simulator (iPhone Xs, 18.4) | `simctl openurl` only | `simctl spawn log`, container copy |
| `iphone-xs` | physical iPhone XS over the network | a human | `devicectl` console + container copy |
| `desktop` | Tauri shell on this Mac | a human | the app's own console |

---

## A. Launch and session

### A1 — cold start paints the cached list
- **Claim**: a cold start renders the last known first page instead of an empty screen.
- **Steps**: kill the app, relaunch, screenshot within 2 s of the first frame.
- **Proof**: `==window songs: seeded N tracks from cache` with `N > 0`, and the
  screenshot shows rows, not the empty-state artwork.
- **Surfaces**: android-emu, ios-sim, iphone-xs.

### A2 — a signed-out app lands on the welcome screen, not a blank one
- **Claim**: no session means `(auth)/welcome`, not a spinner forever.
- **Steps**: fresh install, launch, screenshot.
- **Proof**: screenshot shows the welcome copy; no `Unable to` warnings in the log.
- **Surfaces**: android-emu, ios-sim.

### A3 — the session survives a restart
- **Claim**: the token lives in SecureStore/keychain and is read back.
- **Steps**: with a session, force-stop and relaunch.
- **Proof**: the songs list loads without the welcome screen appearing.
- **Surfaces**: android-emu, iphone-xs.

### A4 — a session that cannot be read does not leave a black screen
- **Claim**: when the keychain refuses — a damaged entitlement, a locked
  device, a restore from backup — the app says something rather than rendering
  nothing.
- **Steps**: install a build whose entitlements are missing (an unsigned
  simulator build reproduces it exactly:
  `CODE_SIGNING_ALLOWED=NO` strips them and `expo-secure-store` then throws
  `KeyChainException: A required entitlement isn't present`), launch, screenshot.
- **Proof**: the screenshot shows the welcome screen or an error, NOT an empty
  black frame. Found the hard way: the app currently renders black and the only
  trace is an uncaught promise rejection in the device log.
- **Status**: this case is expected to FAIL today. It is written down because a
  known hole with a name is worth more than a surprise, and because the same
  failure on a real phone looks like a dead app.
- **Surfaces**: ios-sim.

## B. The list

### B1 — paging forward keeps the window bounded
- **Claim**: scrolling to the end appends a page and drops the oldest; the list
  never grows without bound.
- **Steps**: scroll to the bottom four times.
- **Proof**: successive `==window songs: pages a,b,c,d -> N tracks` lines where
  the page numbers advance and `N` stays at or under `4 * PAGE_SIZE`.
- **Surfaces**: android-emu, iphone-xs.

### B2 — paging back does not jump the scroll
- **Claim**: `maintainVisibleContentPosition` holds the row under the thumb.
- **Steps**: page forward twice, then scroll up past the top of the window.
- **Proof**: a `pages` line whose first index DECREASES, and two screenshots
  around it showing the same track title at the same height.
- **Surfaces**: android-emu.

### B3 — pull to refresh reloads from page 0
- **Claim**: the gesture resets the window rather than re-reading it in place.
- **Steps**: scroll down two pages, pull down at the top.
- **Proof**: `==window songs: pages 0 -> N tracks`.
- **Surfaces**: android-emu, iphone-xs.

### B4 — the desktop reloads from the wheel, with no gesture to lean on
- **Claim**: `PullToRefresh.web.tsx` turns an overscroll into the same reload.
- **Steps**: at the top of the list, scroll up with the trackpad past the threshold.
- **Proof**: the indicator appears, then `==window songs: pages 0`.
- **Surfaces**: desktop. `n/a` elsewhere — the phones have the real gesture.

### B5 — search runs on the server, not on the loaded page
- **Claim**: a term that is not in the loaded window still finds tracks.
- **Steps**: type a term known to be deep in the archive.
- **Proof**: results appear and their dates are outside the loaded window's range.
- **Surfaces**: android-emu, iphone-xs.

## C. Playback

### C1 — tapping a row starts that row
- **Claim**: the queue is rebuilt from the tapped track, by id, not by index.
- **Steps**: tap the third row; read the active track.
- **Proof**: `Track changed` followed by a mini player whose title matches the row.
- **Surfaces**: android-emu, iphone-xs.

### C2 — the collapsed mini player shows the position
- **Claim**: the divider under the mini player fills as the track plays.
- **Steps**: play 60 s, screenshot; play 120 s more, screenshot.
- **Proof**: the filled width in the second screenshot is strictly greater.
  Measured, not eyeballed — see `qa/lib/pixels.py`.
- **Surfaces**: android-emu, ios-sim (deep link autoplay), iphone-xs.

### C3 — a manual skip says it is loading
- **Claim**: the tap raises the switch flag and something spins.
- **Steps**: tap ⏭ in the mini player, screenshot within 400 ms.
- **Proof**: a spinner over the artwork; the flag clears when
  `Playback state: playing` arrives.
- **Surfaces**: android-emu, iphone-xs.

### C4 — the automatic hand-over does NOT spin
- **Claim**: the end-of-track change is warmed ahead and shows no spinner.
- **Steps**: seek to 20 s before the end, let it run out, screenshot at the change.
- **Proof**: `==prefetch` earlier in the log, no spinner in the screenshot.
- **Surfaces**: android-emu, iphone-xs.

### C5 — the show continues when the next link has aged out
- **Claim**: a failed hand-over is reported and recovered, not swallowed.
- **Steps**: replace the next queue entry's url with a dead one (see
  `qa/lib/poison.md`), then let the current track end.
- **Proof**: `==recovery: restarted <key> after a next failure`, and playback
  continues within 10 s.
- **Surfaces**: android-emu. `n/a` on ios-sim (no way to poison without taps).

### C6 — a track that keeps failing is given up on
- **Claim**: recovery is bounded to two attempts per track.
- **Steps**: poison the same entry three times in a row.
- **Proof**: `==recovery: giving up on <key>` on the third.
- **Surfaces**: android-emu.

### C7 — playing to the end ticks the track off
- **Claim**: `store/played` records only tracks that actually ran out.
- **Steps**: let one track end; skip another at its midpoint.
- **Proof**: the MMKV `played` file gains exactly one key; the skipped track's
  key is absent.
- **Surfaces**: android-emu, iphone-xs.

### C8 — the last track of a queue is ticked off too
- **Claim**: `PlaybackQueueEnded` marks the track nothing else could.
- **Steps**: queue one track, let it end.
- **Proof**: the `played` file gains its key.
- **Surfaces**: android-emu.

## D. Voice

The app is called visky, and it stays called visky. The spoken name people
reach for — the station's — belongs to somebody else, so what is claimed here
is only this app's own name and the way Siri actually hears it: "whiskey".

### D1 — Siri opens the app for both the misheard name and the spoken one
- **Claim**: two utterances land here — "open visky music", which Siri hears as
  "whiskey music" and used to answer with the Whisky app in the App Store, and
  "open frisky music", which it did not understand at all.
- **Steps**: say each to Siri on a device with the build installed.
- **Proof**: the app comes to the foreground both times; no App Store card.
- **Counter-check**: "open frisky radio" must still open the STATION's app, not
  this one. If it opens this one, the alternate names have overreached and D3
  is failing in a way a grep cannot see.
- **Surfaces**: iphone-xs. `n/a` on ios-sim — the simulator has no Siri.

### D2 — the alternate names are actually in the build
- **Claim**: the built app carries `INAlternativeAppNames` with exactly three
  entries and their pronunciation hints — three because iOS refuses to INSTALL
  an app with more ("maximum of 3 allowed"), which is a build that looks fine
  until the moment nothing will install.
- **Steps**: read `Info.plist` out of the built `.app`:
  `plutil -extract INAlternativeAppNames xml1 -o - <app>/Info.plist`
- **Proof**: Visky, Visky Music, Frisky Music — and a successful
  `simctl install`, which is the half that actually catches a fourth entry.
- **Surfaces**: a build artefact check; no device needed.

### D3 — the registered mark itself is never claimed
- **Claim**: "Frisky Music" is answered to; "Frisky Radio" — the registered
  mark — is not, anywhere: not in the alternate names, not in the bundle
  display name, not in the Android label.
- **Steps**: grep the built `Info.plist` and `AndroidManifest.xml`.
- **Proof**: no case-insensitive match for `frisky radio`, and no bare `Frisky`
  standing alone as a name. This case exists to FAIL LOUDLY if one is ever
  added: App Review reads metadata as carefully as the app name, and the
  difference between the pairing and the mark is the whole argument.
- **Surfaces**: build artefact check.

### D4 — Assistant opens the app by its label
- **Claim**: "open visky" resolves on Android, where the label is the only
  name Assistant matches — there is no alternate-name list on that platform.
- **Steps**: the Assistant utterance on a phone; on the emulator, the launch
  intent it resolves to.
- **Proof**: `am start` brings up `com.envarg.visky/.MainActivity`.
- **Surfaces**: android-emu (intent form), a physical Android phone (spoken).

## E. Devices and transfer

### E1 — the mini player names the device that owns the sound
- **Claim**: a remote session shows "Playing on ...".
- **Steps**: start playback on the XS, open the emulator's app.
- **Proof**: the label appears and the divider follows the remote position.
- **Surfaces**: android-emu + iphone-xs together.

### E2 — taking playback back moves it
- **Claim**: the picker transfers the sound to this device.
- **Steps**: tap the cast glyph, pick this device.
- **Proof**: `==playback: ` transfer lines, audio here, the label gone.
- **Surfaces**: android-emu.

## F. Store artefacts

### F1 — screenshots exist for every required size
- **Claim**: the listing can actually be filled in.
- **Steps**: run the screenshot pass.
- **Proof**: files in `qa/artifacts/screenshots/` for each required size, of the
  right pixel dimensions, none of them showing a spinner or an empty list.
- **Surfaces**: ios-sim, android-emu.

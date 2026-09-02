# 08 — The desktop, made usable, then rebuilt on Tauri

Full record of the milestone, so the work can be resumed. Started 2026-09-02.

Milestone 04 put the player on the desktop; milestone 07 got the phone paired to it. What neither
did was *use* it for an evening. Doing that produced a list — the window could not be moved, the
device never showed up in the account, the progress bar lied, tapping one track played another —
and the list was long enough to be worth reading as one sentence: **the Electron build was a web
page in a frame, not an app.**

Two thirds of this document is that list being worked through. The last third is the consequence:
once the shell's remaining job was small enough to state in three lines, Electron's 296 MB stopped
being defensible, and the shell was rewritten in Tauri. It is 10 MB and it is the one that ships.

---

## Goal

1. **Make the desktop build behave like an application** — a device the account knows about, a
   window that moves and has a shape, gestures that work.
2. **Fix the player bugs** that turned out not to be desktop-specific at all.
3. **Replace Electron with Tauri**, and fall back to Electron if it does not hold.
4. **Fix cross-device takeover**, which was wrong on every platform.

---

## Part A — The desktop was never a device

Reported first and the most consequential: *"не прописался девайс"*. The desktop appeared nowhere
in the account, so nothing about cross-device playback could work from it.

`playbackSync.ts` opened the session socket the way React Native does:

```ts
new WebSocket(url, undefined, {headers: {'x-auth-token': …, 'x-auth-device': …}})
```

React Native's `WebSocket` takes that third argument. **The browser's does not** — its signature is
`(url, protocols)` and everything after it is dropped on the floor. So the desktop connected with
no credentials at all and the server closed it at the upgrade, every time, silently.

Headers are not available to a browser WebSocket by construction, so the credentials go in the
query string instead — which the API already accepts, because `credentialsFrom` reads header *or*
query:

```ts
const socketUrl = (session: SyncSession): string => {
  if (Platform.OS !== 'web') return apiUrls.playerSocketUrl
  const url = new URL(apiUrls.playerSocketUrl)
  url.searchParams.set('token', session.token)
  …
}
```

Verified by the miniplayer, which stopped being blank and started reading **Playing on SM-N950F**.

While in there: the device announced itself as *"web device"*. `deviceLabel()` now answers `Mac`,
`Desktop` or `Browser`, because the picker is a list of places, and one of them being called "web
device" makes the list unreadable.

---

## Part B — A window with a shape

Three complaints, one cause. Under `titleBarStyle: 'hiddenInset'` macOS draws the traffic lights
over the page and gives back nothing: no title bar means no drag handle and no reserved space. So
the buttons floated on top of the artwork and over the screen's own heading, and the window could
not be moved at all.

The fix is that the app draws that strip itself — `DesktopChrome`, 36pt, with a `.web.tsx` variant
that is a real `<div>` carrying **both** `-webkit-app-region: drag` (Electron) and
`data-tauri-drag-region` (Tauri), gated on `window.viskyDesktop` so the browser build never sees
it. `_layout.tsx` pads the root by the same 36.

Shape: the window opened very wide, and the layout is the phone's single column — there is no wide
form for it to grow into. It is now a 480×900 slab, the proportions of the iPad build, and the
resize is **vertical only**, which comes out of setting the min and max width to the same number:
macOS then offers no horizontal handle at all. Height runs from 560 to past any display, so it can
be dragged to fill the screen.

And the miniplayer would not close by pulling down. On native that gesture is
react-navigation's modal dismissal; **on web react-navigation has none**. `SwipeToDismiss.web.tsx`
adds it — a pointer `Pan` through gesture-handler and Reanimated, plus a `wheel` handler so a
two-finger swipe on the trackpad works too (`deltaY < 0` under natural scrolling). The native file
is a passthrough.

---

## Part C — The player's own bugs

Reported as desktop bugs and mostly not desktop bugs. Four of them, one screenshot, and one of
those four had been shipping on every platform for as long as the component existed.

### The progress bar had three separate faults

**It painted the wrong thing.** The old theme had the played portion at 60% white and the buffer at
25% blue *over* a 40% white track — and 25% blue over 40% white composites **brighter** than 60%
white. At 2:32 of a 58-minute set the bright bar ran out to the 85% the buffer had reached. That is
the *"полоска разлезлась, куда-то уползла"*: the position had not moved, the buffer was being drawn
as if it were the position. Three tones now, and they read as three.

**A tap on it was ignored half the time.** Read from `react-native-awesome-slider`'s source: a tap
fires `onSlidingComplete` but **never** `onSlidingStart`. Our handler bailed out unless
`isSliding` was true, so every tap that was not preceded by a drag was dropped — the
*"то перематывает, то не перематывает"*.

**And it sometimes jumped to the next track.** Two causes. `onValueChange` seeked on every pixel of
a drag, firing a burst of seeks at the player; and dragging to the right-hand edge seeks to
`duration`, which the player reads as *track finished* and answers by advancing. The value handler
is gone entirely — the thumb follows the finger by itself, only the final position is a request —
and the target is clamped to `duration - 1`.

There is one more thing in there worth keeping: after a seek the audio element keeps reporting the
**old** second for a beat, and letting that through yanks the bar back to where the drag started,
which reads as *the seek did nothing*. Reported positions are now ignored until one lands within
1.5s of the request (or 4s pass).

### One track selected, another played

Two writers, no lock. `reconcile` applies the session's state to the player and `handleTrackSelect`
applies the user's tap, and a frame already in flight would overwrite the tap — so the track that
started was whichever won the race, and pressing again "fixed" it.

`runLocalAction` puts the user's action into the same serialised chain the reconciler uses, and
stakes a claim for 5 seconds — cleared as soon as a frame comes back carrying our own
`origin_device_id` — during which stale remote frames cannot undo it.

### The white rectangle

*"вобще непонятный артефакт"*, bottom right of the miniplayer, on the Designed-for-iPad build.
Measured off the screenshot rather than guessed: 33×29 pixels at 60% alpha, which is exactly
`minimumTrackTintColor`, at exactly the position of a thumb at 100%. `thumbWidth={0}` does not stop
the slider rendering the thumb's `View` — and that View carries the track colour. `renderThumb={()
=> null}` does.

### The volume control was a mock

`PlayerVolumeBar` contained `const volume = 1.0` and an `updateVolume` that wrote to the console.
It had never done anything. Now on `useTrackPlayerVolume`, and both of its calls are wrapped,
because the player may not be set up when the screen first mounts.

It was also **invisible in the Electron build**, which is a react-native-web fact worth recording:
the slider wraps itself in a plain `<div>` for its hit slop, RNW does not style that div, and as a
flex item of a **row** it collapses to its intrinsic width, which is nothing. In a column it is
stretched to full width. The wrapper is a column now. (Proved with a temporary green background
before believing it.)

Then, on the user's ask, the two speaker icons became buttons: a tenth per press, and
**press-and-hold** repeats after 350 ms at 120 ms a step — the full range in about a second. The
level a step is measured from is a `ref`, not the state value, because the repeat runs on a timer
and a callback closed over `volume` computes the same result on every tick.

---

## Part D — Electron out, Tauri in

The user's argument was two sentences: the app is 300+ MB, and the desktop logs in by QR anyway.
The second is the load-bearing one.

The Electron shell was doing three jobs. Checked one at a time:

| job | still needed? |
|---|---|
| serve the bundle from an origin (`visky://`) | **no** — Tauri serves `tauri://localhost` itself |
| inject CORS headers for VK's CDN | **no** — see below |
| host a `<webview>` for the VK password login | **no** — `welcome.tsx:51` gates it behind `Platform.OS !== 'web'`; the desktop is paired from a phone |

The CORS one is the interesting one. Chromium has **no native HLS**, so shaka-player fetches every
segment itself over XHR, from the page origin, and VK's CDN sends no CORS headers — hence
Electron's `webRequest.onHeadersReceived` and its host list. **WKWebView plays HLS natively**:
shaka hands the manifest to the `<video>` element and media loading is never CORS-gated. The whole
mechanism has no user on this engine.

What is left is the window. `desktop/shell/main.rs` is 112 lines, and the only thing it injects
into the page is:

```rust
const BRIDGE: &str = r#"window.viskyDesktop = {platform: 'macos', shell: 'tauri'};"#;
```

Plus one guard: `on_navigation` sends any `http(s)` navigation to the real browser and refuses it,
because a chrome-less window that follows a link has no back button. Requests — the API, the
playback socket, every media segment — are not navigations and never reach it.

### What it cost and what it saved

```
Electron   .app 296 M    dmg 128 M
Tauri      .app  10 M    dmg 8.3 M      (arm64)
Tauri      .app  16 M    dmg  13 M      (universal)
```

Toolchain: Homebrew's `rust` formula was swapped for `rustup` (nothing depended on `rust`;
uninstalling it also autoremoved `llvm`, 1.9 GB), both darwin targets added.

**Electron is not deleted.** It is `desktop-electron/`, it still builds, and
`scripts/build-desktop-electron.sh` still works — verified this milestone, not assumed.

---

## Part E — Five things the port broke

Recorded in full because four of the five were invisible from the code.

### 1. The traffic lights sat high and clipped

Measured, both builds, by sampling the rendered pixels — the close button's centre:

```
Electron   x=19.8  y=17.8
Tauri      x=19.8  y=8.8
```

tao's origin for `traffic_light_position` is about 9pt above the one Electron uses. Hence
`TRAFFIC_LIGHT_Y = TITLEBAR_HEIGHT / 2 + 2` rather than a plain half, and a re-measurement
afterwards reading `19.8 / 17.8`.

### 2. The drag strip did nothing

The same `data-tauri-drag-region` div that Electron dragged by would not move the Tauri window. A
control experiment settled it: a synthetic `CGEvent` drag (written for this, since AppleScript can
click but not drag) moved the Electron window `700,80 → 880,304` and moved Tauri's not at all.

The cause is the ACL. `core:default` does **not** include `core:window:allow-start-dragging`, and
without it the drag call is refused silently — no console error, no Rust log, nothing. Granted
explicitly in `capabilities/default.json`, and the same synthetic drag then moved the window
`60,80 → 240,304`: an identical delta.

### 3. Icons were missing, and the ones that remained were off-centre

The search magnifier, the player's collapse chevron and the edit button rendered as nothing. This
is not a Tauri bug — it is `@expo/vector-icons` on **any** web build, and it is a good one:

`createIconSet` renders an empty `<Text/>` until `fontIsLoaded`. `Font.loadAsync` injects the
`@font-face` rule into the document synchronously, but the promise it returns reports the
*verification*, which expo-font does with **fontfaceobserver** — and fontfaceobserver measures the
width of the string `"BESbswy"`. An icon font contains none of those seven letters, so the
measurement never changes, the promise rejects on its 12-second timeout, the `await` throws, and
`setState` never runs. That instance is blank for ever.

Only the **first** instance of each family is affected, because every later one mounts with
`fontIsLoaded` already true — the rule is in the stylesheet by then. That is why it looked random:
one dead glyph per family, whichever mounted first.

Patched through `patch-package` (already wired into `postinstall`): on web, set the state, render,
and let the browser repaint when the file lands — exactly what it does for every other webfont.

This also explains *"иконки не по центру"*, which was never a layout bug: a blank glyph is
zero-width, and `space-between` distributes what is left.

### 4. `failed to run 'cargo metadata' … No such file or directory`

Reported by the user, not reproducible in my shell, which is the tell. Homebrew's `rustup` is
**keg-only**: only the `rustup` binary is symlinked, the `cargo`/`rustc` shims are not on the
default `PATH`, and a non-interactive bash never reads `~/.zshrc`. Reproduced with
`env PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"`, and the script now discovers the
toolchain in four places before giving up (`rustup which cargo`, `~/.cargo/bin`, and both Homebrew
prefixes).

### 5. The DMG looked like a plain folder

Tauri's own DMG bundler had hung earlier, so it had been replaced with a bare `hdiutil` step —
which produces a working, ugly image. The hang was not Finder-in-principle: it was **stale attached
disk images** from earlier attempts. (Noted in the script: if it recurs, look at `hdiutil info`.)

With that cleared, Tauri's bundler is back, configured with electron-builder's own geometry — app
at 140,200, Applications at 400,200, window 540×380 — and its background extracted from the
Electron DMG. Byte-identical, `md5` checked. The image now carries `.background/`, `.DS_Store`,
`.VolumeIcon.icns` and the `Applications` symlink, i.e. the same structure with the same arrow.

---

## Part F — The build, restructured

The user's complaint was concrete: the Electron build lands in `dist/`, the Tauri artefacts were
buried at `src-tauri/target/universal-apple-darwin/release/bundle/macos` — *"еле нашел"* — and a
`--arch arm64` run appeared to have built universal.

**It had not.** By creation time, the `universal-apple-darwin` and `x86_64-apple-darwin` trees were
from my own earlier runs at 14:13–14:14; the 15:03 arm64 build wrote only to `aarch64-apple-darwin`.
`target/` is cargo's compilation cache and it keeps one directory per architecture ever built. The
answer is not to make the cache tidier but to stop looking in it: **everything lands in
`desktop/dist`** now, with electron-builder's own names.

```
desktop/                  the shipping build (Tauri)
  package.json            @tauri-apps/cli only
  shell/                  the Rust shell — no nested src/
    main.rs               beside Cargo.toml, via [[bin]] path
    Cargo.toml  build.rs  tauri.conf.json  Info.plist
    capabilities/  icons/  background.tiff
  web/  dist/             generated, git-ignored
desktop-electron/         the fallback, unchanged and still building
```

`src-tauri/src/main.rs` became `shell/main.rs`; the Tauri CLI has no requirement that the directory
be called `src-tauri`, and `[[bin]] path` removes the second `src`.

Flags now match the Electron script one for one, which was the ask:

```
scripts/build-desktop.sh                  # dmg + pkg, universal
scripts/build-desktop.sh --dmg            # dmg only (faster)
scripts/build-desktop.sh --pkg            # pkg only
scripts/build-desktop.sh --arch arm64     # or x64, or universal (default)
scripts/build-desktop.sh --skip-bundle    # reuse desktop/web, rebuild the shell only
scripts/build-desktop.sh --run            # do not package; launch it
scripts/build-desktop.sh --unsigned       # skip signing entirely
```

One ordering detail that is not obvious and will bite whoever touches it: the `.app` is copied to
`dist` **before** the dmg bundler runs, because that bundler deletes `bundle/macos/visky.app` on
its way through.

---

## Part G — Takeover, which was wrong everywhere

Two reports, one paragraph apart, and they turned out to be two different bugs sharing a screen.

### *"в свернутом миниплеере плей перехватывается хорошо, в развернутом — не перехватывает"*

Not about which player is on screen; about **when** the button is pressed.

A passive device runs `becomePassive` for every frame the playing device sends — and it sends
progress every few seconds. Each one went through `withApplying`, which deafens the device to its
own player for 1.2 seconds afterwards (`if (isApplyingRemote()) return` in `usePlaybackSync`, there
to stop echo). So roughly a quarter of the time, a press of play produced **nothing at all**: no
sound here, no takeover there.

`becomePassive` now works out whether there is anything to apply *before* arming that window, and
returns without arming it when the device is already silent and already on the session's track.
Silence is not something to apply.

The same function had a second fault, fixed just before: following the session's track sat behind
`if (!restored)`, so after the first frame a passive device stopped following at all — the sound
stopped when you picked something on the phone, which looked right, and this screen kept
highlighting the **previous** track for ever, because `useActiveTrack` reads the local player and
the local player had never been told. That is the *"выбранная композиция не подсвечивается"* report,
and it was common to desktop, Android and iOS.

### *"перехват происходит с того момента, на котором остановился плей"*

Desktop left at 16:41, phone plays on to 19:25, press play on the desktop — and the account rewinds
to 16:41.

A passive device's own position stops moving the instant another device takes the sound, so it is
stale by exactly however long that device has been playing. Announcing it on a takeover rewinds
everybody. `sessionPositionFor(trackId)` returns the session's projected position for that track,
and the takeover both **announces** it and **seeks the local player to it first**, so the sound
does not start at the wrong second on the way.

---

## Verified

- **Both build scripts run end to end**, in a shell with no rustup on `PATH`
  (`env PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"`):
  `build-desktop.sh --dmg --arch arm64` → exit 0, `dist/visky.app` 10 M and
  `dist/visky-1.0.0-arm64.dmg` 8.3 M;
  `build-desktop-electron.sh --dmg --arch arm64` → exit 0, `dist/visky-1.0.0-arm64.dmg` 128 M.
  The `--pkg` path ran earlier in the milestone (universal, ~11 M) but not in this final pass.
- **Signatures.** `codesign --verify --deep --strict` passes; `pkgutil --check-signature` reports
  *signed by a developer certificate issued by Apple for distribution*.
- **The shipped app launches** from `desktop/dist/visky.app` and shows: the search magnifier
  present, the traffic lights in the middle of the strip, the window draggable by it, and the
  miniplayer reading **Playing on iPhone** with the right row highlighted — which is Part G's
  passive-follow fix working against the user's real second device.
- **The window resizes vertically only**, with no horizontal handle offered.
- **Press-and-hold volume**, driven by a synthetic `CGEvent` hold: 1.5 s on the quieter icon takes
  100% → ~20%, 2 s on the louder one returns it to 100%.
- **The drag region**, by the control experiment in Part E2.
- `tsc --noEmit` introduces no new errors. (Two pre-existing ones remain, in files this milestone
  does not touch: `MovingText.tsx:56` and `TrackShortcutsMenu.tsx:44`.)
- **QR pairing to the desktop** — verified by the user in milestone 07, and the Tauri build shows
  the same screen from the same bundle.

## Not verified

- **The two takeover fixes, end to end.** Deliberately: testing them means taking the sound off the
  user's iPhone, and there is no way to hand it back from here. Everything up to the press is
  verified; the press is theirs.
- **The white rectangle on a fresh Designed-for-iPad build.** The cause was measured off the
  screenshot and the fix is the one that removes that exact View, but that build is the user's to
  make.
- **Notarisation.** Needs Apple credentials with 2FA (`en.varg@me.com`). The script supports both
  credential styles and skips the step when neither is in the environment.
- **Tauri on anything but macOS.** The shell compiles the title-bar and traffic-light code under
  `#[cfg(target_os = "macos")]`; nothing else has been tried.

---

## Files

| file | |
|---|---|
| `app/src/services/playbackSync.ts` | credentials in the query string on web; browser `WebSocket` |
| `app/src/helpers/device.ts` | `deviceLabel()` — Mac / Desktop / Browser |
| `app/src/components/DesktopChrome.tsx`, `.web.tsx` | the 36pt drag strip; both drag attributes |
| `app/src/components/SwipeToDismiss.tsx`, `.web.tsx` | pull-down-to-close on web; pan and wheel |
| `app/src/app/_layout.tsx` | title bar mounted, root padded by its height |
| `app/src/components/PlayerProgressbar.tsx` | tap seeks, no per-pixel seeks, clamped target, three tones, no thumb |
| `app/src/components/PlayerVolumeBar.tsx` | real volume; column wrapper; icons as press-and-hold buttons |
| `app/src/hooks/useTrackPlayerVolume.tsx` | both player calls guarded |
| `app/src/services/playbackReconciler.ts` | `runLocalAction`; `becomePassive` follows and no longer over-applies; `sessionPositionFor` |
| `app/src/hooks/usePlaybackSync.tsx` | takeover announces and seeks to the session's position |
| `app/patches/@expo+vector-icons+15.1.1.patch` | the fontfaceobserver dead-glyph fix |
| `desktop/shell/main.rs` | the Tauri shell |
| `desktop/shell/tauri.conf.json` | bundle, DMG geometry, hardened runtime |
| `desktop/shell/capabilities/default.json` | `core:window:allow-start-dragging` |
| `desktop/shell/Cargo.toml` | `[[bin]] path`, size-tuned release profile |
| `scripts/build-desktop.sh` | the Tauri build (was `build-desktop-tauri.sh`) |
| `scripts/build-desktop-electron.sh` | the Electron build (was `build-desktop.sh`) |

---

## Open, and what to do next

1. **Re-test takeover** on two real devices — expanded player, and the resumed position. It is the
   one thing here that could not be checked from this machine.
2. **Notarise a build** and confirm it opens on a second Mac without
   `xattr -dr com.apple.quarantine`.
3. **Decide Electron's fate.** `desktop-electron/` is kept deliberately as a fallback; if the Tauri
   build survives normal use, it can go — and with it the custom protocol handler, the CORS host
   list, the `<webview>` and its two preloads.
4. **Upstream the vector-icons patch**, or stop verifying icon fonts at all: the same dead glyph is
   waiting for anyone who runs Expo on the web.
5. Still open from earlier milestones: the node selector pinned to `mini-n` (07, item 3), Android
   Auto on the DHU (05, item 5), and the Devices list that never forgets a device (02, item 6).

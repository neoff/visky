# 05 — Second screens: the wrist and the car

Full record of the milestone, so the work can be resumed. Started 2026-08-31.

The player lived on one screen at a time: a phone in the hand, or a desktop window. This
milestone puts it on three more surfaces the user is not holding — an Apple Watch, a CarPlay head
unit and an Android Auto head unit — plus the gesture work on the miniplayer that made the phone
controls usable without looking.

The short version: **all three second screens are the same problem** — something outside the JS
runtime needs to show state and send commands back, while the app is backgrounded and possibly
not running at all. The watch link was built first and its shape (publish a snapshot, receive
commands, never assume the other side is listening) was reused for both car platforms.

The long version is that "it builds" was wrong six separate times in this milestone, each time
in a way that produced a perfectly clean build log. Part F is the list. The sixth is the worst of
them: the app launched, ran, played audio and showed nothing at all.

---

## Goal

1. **A watch app** with transport controls and a queue you can pick from, playing on the phone.
2. **Miniplayer gestures** — hold to scrub, tap to skip, tap-again to go back.
3. **CarPlay**, now that Apple has granted the entitlement.
4. **Android Auto**, the same tree on the other platform.
5. **No second UI codebase**, and no second source of truth for what is playing.

---

## Part A — Miniplayer gestures

`src/hooks/useSeekGestures.tsx` + rewritten skip buttons in `src/components/PlayerControls.tsx`,
shared by the miniplayer and the full-screen player.

| Control | Tap | Hold |
|---|---|---|
| next | next track | `seekBy(+10)` every 400 ms |
| previous | restart, or previous if tapped again | `seekBy(-10)` every 400 ms |

`HOLD_MS = 280` rather than RN's default 500: at 500 ms a deliberate hold reads as a stuck
button before anything happens.

"Tapped again" is **two** rules, not one — `BACK_TAP_WINDOW_MS = 1500` OR position
`<= AT_START_SECONDS` (3):

```ts
const tappedAgain = now - lastTapAt.current < BACK_TAP_WINDOW_MS
const position = await TrackPlayer.getProgress().then((p) => p.position)
if (tappedAgain || position <= AT_START_SECONDS) { await TrackPlayer.skipToPrevious(); return }
await TrackPlayer.seekTo(0)
```

The timer covers a deliberate double tap. The position covers the user who restarted, listened
for two seconds, and pressed again meaning "no, the one before". Either rule alone gets one of
those wrong.

A previous button was **added** to the miniplayer and then **taken out again**. Adding it forced
`columnGap` 16 → 13 and `paddingLeft` → 12 to buy the width back, and the track title still lost:
a miniplayer is a glance and a thumb, and the fourth control cost the one thing on it that has to
be readable. Going back lives in the full player, one tap away. The miniplayer is play/pause and
forward, and the spacing is back to 16.

---

## Part B — The Apple Watch app

Three pieces:

- `app/modules/watch-bridge/` — a local Expo module wrapping WatchConnectivity.
- `app/watch/` — the watchOS sources, kept in the repo rather than in generated `ios/`.
- `app/plugins/withWatchApp.js` — adds the target to the Xcode project at prebuild.

### Why a plugin and not a committed `ios/`

The user asked for the custom `ios/` changes to be force-added, since `ios/` is gitignored. That
was **not** done, deliberately, and the reasoning is worth keeping:

`ios/` is generated, and **EAS runs prebuild on every cloud build**. A target added by hand
survives exactly until the next prebuild — that is, it vanishes on the one machine that builds
releases. Committing `ios/` wholesale is worse: EAS then stops prebuilding, and every config
plugin silently stops applying, `withVkTrustAnchor` included. The sources live in `app/watch/`,
which is tracked, and the plugin re-adds them every regeneration.

`git add -f app/ios` still works if the decision is reversed — but then the plugin should be
deleted, so there are not two sources of truth. **Answered: no.** See "Open", item 2.

### The wire format

`modules/watch-bridge/src/WatchBridge.types.ts` — `WatchSnapshot` (playing, title, artist,
trackId, position, duration, `at`, queue) and `WatchCommand`
(play/pause/toggle/next/previous/playTrack/refresh). It crosses a process *and* a device
boundary, so it is versioned (`v: 1`) and mirrored by hand in `watch/WatchLink.swift` — it
changes the way a network protocol changes, both sides deliberately.

Both WatchConnectivity channels are used, because they fail in opposite directions:

- `updateApplicationContext` — one pending payload, replaced each time, delivered whenever the
  watch next wakes. This is what makes the watch correct after an hour in a pocket.
- `sendMessage` — immediate, but only while the watch app is reachable. This is what makes a tap
  on the phone move the wrist now.

`services/watch.ts` coalesces (`MIN_PUBLISH_MS = 2000`, `QUEUE_LIMIT = 60`) and lives in the
**playback service**, not a hook — the watch is used precisely when the screen is off and a
screen's listeners are gone.

### Three pbxproj bugs, all silent


1. **Paths doubled.** The group carries `path = viskyWatch` and children were added as
   `viskyWatch/WatchLink.swift` → `ios/viskyWatch/viskyWatch/WatchLink.swift`. Fixed by passing
   basenames so the group and the build phase share one file reference.

2. **`addTargetDependency` did nothing.** `xcode@3` guards on
   `if (pbxContainerItemProxySection && pbxTargetDependencySection)` and silently no-ops when
   those sections are absent — an Expo project has neither. The phone app built, the `Watch/`
   folder was created inside it, and only the copy step failed:
   `The file "viskyWatch.app" couldn't be opened`. The watch target was never built at all. Fixed
   by creating both sections before `addTarget`.

3. **`addResourceFile` threw** `Cannot read properties of null (reading 'path')` — it
   unconditionally calls `correctForResourcesPath`, which needs a group literally named
   `Resources`. Replaced with manual `addFile` + `addToPbxBuildFileSection` +
   `addToPbxResourcesBuildPhase`.

Also: the watch icon carried an alpha channel, which the App Store rejects. `sips` resize and
`--padToHeightWidth` both preserved it; stripped with a PNG→JPEG→PNG round trip, verified
`hasAlpha: no`.

### Verified

```
** BUILD SUCCEEDED **
visky.app/Watch/viskyWatch.app        1.3M
  DTPlatformName                      watchsimulator     ← built for watchOS, not iOS
  WKApplication                       true
  WKCompanionAppBundleIdentifier      com.envarg.visky
  CFBundleIdentifier                  com.envarg.visky.watchkitapp
  Assets.car                          917592 bytes
  CFBundleIcons → CFBundleIconName    AppIcon
```

**Verified end to end on paired simulators**, which the first draft of this document said was
impossible. It is not — the ORDER of installation is what matters:

```
xcrun simctl uninstall <phone> com.envarg.visky
xcrun simctl uninstall <watch> com.envarg.visky.watchkitapp
xcrun simctl install   <phone> visky.app                     # the companion FIRST
xcrun simctl install   <watch> visky.app/Watch/viskyWatch.app # then the watch app
```

Install them the other way round and the phone's session sits at `appInstalled: NO` with a null
`appInstallationID` for ever, `updateApplicationContext` fails with
`WCErrorCodeWatchAppNotInstalled`, and it reads exactly like "simulators cannot pair".

Done in that order, on iPhone 16 Pro (iOS 18.5) paired with Apple Watch Series 10 (watchOS 11.5):

```
phone:  reachable: YES, paired: YES, appInstalled: YES, appInstallationID: 8167...
watch:  reachable: YES, companionAppInstalled: YES
watch → phone   sendMessage {"command":"refresh"} → WCMessageResponse error: kNoErr
```

- the watch shows the phone's live track — `Dance to my Beat Aug…` / `Zima Blue`
- tapping play on the wrist logs `==watch: command toggle` in JS, and the phone goes
  `buffering` → `playing`

**Still not verified:** real hardware. A simulator pair does not exercise Bluetooth, the
transfer's power behaviour, or a watch that has been out of range for an hour.

---

## Part C — CarPlay

Apple granted the CarPlay audio entitlement before this milestone. That is **one of three**
things needed; the other two were the work.

### What was already free

react-native-track-player keeps `MPNowPlayingInfoCenter` filled, so the CarPlay **Now Playing**
screen — title, artist, artwork, duration, scrubber, transport — needs nothing from us. What was
missing was appearing on the dashboard at all, which needs the entitlement *and* a scene.

### The scene manifest, and the one line that is absent

The entitlement `com.apple.developer.carplay-audio` is declared in
`app.json → ios.entitlements`, where every other entitlement in this project lives (04 wrote the
rule down for MusicKit). `plugins/withCarPlay.js` writes only the `UIApplicationSceneManifest`
into Info.plist, declaring **only**:

```
UIWindowSceneSessionRoleApplication
  UISceneClassName          UIWindowScene
  UISceneDelegateClassName  ViskyPhoneSceneDelegate
CPTemplateApplicationSceneSessionRoleApplication
  UISceneClassName          CPTemplateApplicationScene
  UISceneDelegateClassName  ViskyCarPlaySceneDelegate
UIApplicationSupportsMultipleScenes  true
```

`UIWindowSceneSessionRoleApplication` **is** declared, and has to be — see Part F.6. The first
version of this plugin left it out on the theory that the phone would stay on the pre-scene path
while UIKit managed only the car. That theory is wrong, and it cost the app its entire user
interface.

The delegate is named by its Objective-C symbol, not `$(PRODUCT_MODULE_NAME).Class`: the class
lives in the `Car` pod, not the app target, so the substitution would resolve to the wrong
module. `@objc(ViskyCarPlaySceneDelegate)` gives the runtime a flat name.

### The templates

`modules/car/ios/CarPlaySceneDelegate.swift` builds a `CPTabBarTemplate` of three
`CPListTemplate`s — **Now playing** (the live queue), **Favorites**, **Artists** (one level down
to that artist's tracks). Three roots and one level is the product, not a shortcut: Apple rejects
hierarchies deep enough to read while moving. Search, playlists and anything needing a keyboard
stay on the phone.

Refreshes update each root's sections in place rather than replacing the root template, which
would throw the driver back to the first tab mid-scroll. Pushed artist lists are a snapshot by
design.

---

## Part D — Android Auto

### Why react-native-track-player cannot do this

Checked against the installed 4.1.2, not from memory:

```
MusicService : HeadlessJsTaskService          ← not a MediaBrowserService
uses com.google.android.exoplayer2            ← not media3
AndroidManifest: no android.media.browse.MediaBrowserService intent filter
```

So there is no browse tree and nothing for a head unit to discover. The app is invisible in a
car today.

### One session, not two

`modules/car/android/.../CarBrowserService.kt` is a `MediaBrowserServiceCompat` that supplies the
tree and **deliberately does not supply playback**. The obvious shortcut — open our own
`MediaSessionCompat` and forward commands to JS — produces two live sessions for one app: two
notifications, two sets of metadata, and a head unit that picks whichever it saw last.

Instead the service hands Android Auto **the session RNTP already owns**, so transport, title,
artwork and progress all come from the one place that knows them. Reaching it costs two
reflection hops:

```
MusicService.player            (private)          → reflection
  BaseAudioPlayer.getNotificationManager()         (public)
    NotificationManager.mediaSession (private)     → reflection
      .sessionToken
```

Neither package exposes the token publicly — verified against RNTP 4.1.2 and kotlinaudio v2.1.0,
both pinned and both effectively frozen (RNTP 4.x is still on end-of-life ExoPlayer 2). The
failure mode is contained: no token means the car has a working library and dead buttons, and it
is logged as such under the `==car` tag.

`bindService` runs **without** `BIND_AUTO_CREATE` on purpose — browsing must not start the
playback service and put up a foreground notification for nothing. Retry is bounded
(`TOKEN_MAX_ATTEMPTS = 30`), because "driver is browsing and has not pressed play" is a
legitimate steady state, not a failure to poll through.

`onGetRoot` allows only our own package, `com.google.android.projection.gearhead`,
`com.google.android.gms` and the quick-search box. An exported browser service that answers
everyone hands the user's library to any app on the device.

---

## Part E — The shared tree

`modules/car/src/Car.types.ts` — one format, two consumers.

```ts
CarNode { id, title, subtitle?, artwork?, playable, browsable, nowPlaying? }
CarTree { v: 1, children: Record<parentId, CarNode[]> }
CarCommand = play(nodeId) | playPause | next | previous | refresh
```

**The whole tree is pushed, not fetched node by node.** Request/response is the obvious design
and the wrong one: Android Auto calls `onLoadChildren` on its own schedule including while JS is
idle, and CarPlay expects a list template populated the instant it is pushed. Either way a round
trip to JS shows the driver a spinner. This works only because the tree is small on purpose —
`QUEUE_LIMIT 60`, `FAVORITES_LIMIT 100`, `ARTIST_LIMIT 60`, `ARTIST_TRACK_LIMIT 40`.

**No now-playing channel exists.** Both platforms read `MPNowPlayingInfoCenter` / the Android
MediaSession, which RNTP already fills. An earlier draft published our own copy; it was deleted
as a second source of truth for something neither platform asks us about. All that survives is
the `nowPlaying` flag on a node, so a row can be marked.

**A track node's id is `${containerId}#${trackKey}`.** Tapping a song under Favorites means "play
my favourites, starting here", not "play this one song then fall silent". The container half is
the only thing that survives the trip through the head unit.

Favourites are matched through `useFavoritesStore` keys (artist+title), **not** `rating === 1` —
that is the old local flag nothing maintains. See the note in `store/favorites`.

---

## Part F — Six times "it builds" was wrong

The theme of this milestone, continuing 04's.

1. **`xcodebuild` returned exit 0 on a build that never ran.** The working directory had reset,
   the workspace was not found, and `| tail` swallowed the code. Check for `BUILD SUCCEEDED`, not
   the exit status.

2. **`tree["v"] as? Int` silently dropped every publish.** A JS number arrives as NSNumber or
   Double; the conditional cast to `Int` fails, and it was inside a `guard`. Symptom: the car sat
   on "Connecting…" forever with no log anywhere. Now parsed element-wise, `NSLog`s the reason,
   and JS warns when the native side returns false.

3. **`tabTitle` without `tabImage` is ignored.** All three tabs rendered as the system "More"
   tab, titles dropped.

4. **The tree was published only from the playback service**, which does not exist until
   `setupPlayer` has run. A driver who plugged in before ever pressing play got a placeholder
   that never resolved. `startCarLink()` is now also called from the root layout, idempotent, and
   the tree builder tolerates an unset player.

5. **`ViskyCarPlaySceneDelegate` is referenced by nothing but a string in Info.plist.** UIKit
   instantiates it by name through the Objective-C runtime, which is not a reference the linker
   can see — and the class lives in the static `Car` pod, so a Release link is entitled to drop
   the object file it sits in. The symptom would have been the app appearing on the CarPlay
   dashboard and then going black, on Release only, which is to say on TestFlight and not on
   anything built while developing it. `CarModule` now names the class in a `private static let`
   and prints it from `OnCreate`, so the reference is real rather than something an optimiser can
   fold away. Verified below, by `nm` on a Release binary.

6. **The app had no user interface at all, and every check said it was fine.** Declaring a
   `UIApplicationSceneManifest` — for CarPlay, with `UIApplicationSupportsMultipleScenes` true —
   moves the WHOLE app onto the UIScene lifecycle, the phone included. Expo's generated
   AppDelegate still builds its window the pre-scene way:

   ```swift
   window = UIWindow(frame: UIScreen.main.bounds)
   factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
   ```

   That window has no `windowScene`, so UIKit never attaches it and never draws it. The app
   launched, JS ran, the session restored, the playlist loaded, the websocket connected, AVPlayer
   started a stream — and the screen was black. Release and Debug, iOS 18.5 and 26.1, both alike.

   **The evidence that closed the risk gate was worthless.** Part E claimed the gate was proved by
   the notification permission dialog appearing, on the reasoning that it needs "both a key window
   and app code executing". It needs neither: system alerts are presented by SpringBoard in its own
   window and appear whether or not the app has one. The dialog was showing on top of nothing.

   What actually found it was rendering a bare red `View` with the word PROBE from the root
   layout. It did not appear either — which ruled out every JS-level explanation at once — and
   deleting `UIApplicationSceneManifest` from the installed bundle's Info.plist, with no rebuild,
   brought it straight back.

   `plugins/withCarPlay.js` now declares the phone's scene role too and appends a
   `ViskyPhoneSceneDelegate` to AppDelegate.swift that adopts the AppDelegate's existing window
   into the connecting `UIWindowScene`. The delegate also forwards `openURLContexts` and
   `continue userActivity` to `RCTLinkingManager`: under the scene lifecycle those callbacks stop
   arriving on the app delegate, and without them `visky://` — the auth handover — would have gone
   quiet as the second half of the same bug.

Two of the verifications were also broken by hand: truncating the log file of a running Metro
(the file went sparse and the evidence vanished), and looking for symbols in the 58 KB `visky`
stub instead of `visky.debug.dylib`, which holds the actual code under Xcode's debug-dylib
layout.

---

## Part G — Android Automotive OS, and the wall at the end of it

Android Auto and Android Automotive OS are two different platforms that share one browse API.
Auto is projection: the phone runs the app and paints a head unit. Automotive OS is the car
running Android itself — **there is no phone**. Everything below came out of putting the app on an
AAOS emulator, and none of it is visible any other way.

### Three real bugs, all fixed

**1. The app was invisible, because the descriptor has two names.** The manifest declared
`com.google.android.gms.car.application` — the Android Auto key — and nothing else. Automotive OS
scans for `com.android.automotive`. Same `automotive_app_desc.xml`, different meta-data name, and
each platform only looks for its own. The service was installed, exported and answering, and the
car simply never asked it anything. Both are declared now.

**2. `onGetRoot` denied the car.** The allowlist named Google's projection packages. On AAOS the
caller is the system media centre — `com.android.car.media` on AOSP, whatever the manufacturer
shipped on a real vehicle. A name list cannot be right there. `isPlatformApp()` now also admits a
caller installed in the system image or signed with the platform key: on a car, the browser IS
the platform, and it is already as trusted as the OS holding the library. Everything else still
has to be named.

```
==car: onGetRoot from com.android.car.media -> allowed
```

**3. There was nothing to serve.** `onLoadChildren` parks the caller until JS publishes a tree —
which is right on a phone, where the app is running, and useless in a car, where nothing of ours
is. `CarLink` now writes each published tree to `SharedPreferences` and reads it back in the
service's `onCreate`, so a cold car gets the playlist as it was when the app last ran and JS
replaces it if it ever comes up. The `Context` for that comes from `CarModule` and NOT from the
browser service, which only exists while a head unit is browsing — the one moment the cache is of
no use.

```
==car: restored a cached tree with 41 parents
```

### The wall: the session token, and how it was taken down

The media app still showed an empty screen, and the reason was exact:

```
==car: restored a cached tree with 41 parents
==car: onGetRoot from com.android.car.media -> allowed
                                   ← onLoadChildren was never called
dumpsys media_session               no session for com.envarg.visky
```

`MediaBrowserServiceCompat` holds every client connection until `setSessionToken()` is called.
This service got its token by reflecting react-native-track-player's session, and that session
does not exist until `setupPlayer` has run in JS. On a phone that is nearly always true by the
time a car is plugged in. On Automotive OS it is never true: the car starts the browse service
directly, and no Activity, no JS runtime and no player exist to have made one. The tree was
correct, cached, and unreachable — a deadlock, not a missing feature.

`setSessionToken` may be called exactly once, so there is no placeholder to hand over later.

**THE PHONE ALWAYS OWNS THE SESSION.** It holds the player, the queue and the library; it is the
source of truth, and a second session beside it is precisely the bug Part D was written to avoid.
That argument is an argument about a PHONE, and it does not reach a platform where there is no
phone. So the split is drawn at the platform, read from `PackageManager.FEATURE_AUTOMOTIVE` rather
than inferred from who is browsing:

- **Phone / Android Auto** — unchanged. Adopt react-native-track-player's session by reflection,
  never create one. One session, as before.
- **Automotive OS** — own the session, because nothing else here can. Transport callbacks map to
  commands the phone side already understands, and the player's own session, once it exists, is
  *mirrored* into ours through a `MediaControllerCompat` rather than competing with it.

`onPlay` and `onPause` are deliberately NOT folded into `playPause`. A head unit sends whichever
one it means, and a toggle gets it backwards exactly when the car and the player disagree about
the current state — the driver presses play on something already playing and it stops. The wire
format gained `resume` and `pause`; the watch has had the equivalent from the start.

### Covers, and the fourth thing the car does differently

The list came up with correct titles, correct artists and coloured placeholder squares where the
covers belong. Nothing in the log — because nothing failed.

The tree carries the same remote artwork urls the phone UI uses, and Android Auto's projection
host downloads those itself. Automotive OS does not. The car's image loader resolves `content://`,
`file://` and `android.resource://`, and silently falls back to a generated placeholder for
anything it would have to fetch over the network.

Handing it a bitmap instead is not the way out either: `onLoadChildren` answers with the whole
page in one binder transaction, and fifty decoded covers do not fit in the 1 MB a transaction
gets.

So `CarArtwork` fetches each cover once into the cache directory under a SHA-1 of its url, and
`CarArtworkProvider` serves it back as `content://<applicationId>.carartwork/<sha1>`. A row goes
out without an icon the first time, the bytes are fetched behind it, and `notifyChildrenChanged`
redraws the list — debounced, because a page of fifty finishes as fifty separate events and
redrawing fifty times only makes it flicker.

The provider is exported, because the client is the system media centre and a browse result
carries no uri grant. What that exposes is bounded deliberately: read-only, one directory, and a
name that must be forty hex characters — so `..` and absolute paths are not escaped, they cannot
be spelled. The contents are album covers that were public on the internet a moment earlier.

```
run-as com.envarg.visky --user 10 ls cache/car-artwork | wc -l     35
```

### Verified on the Automotive emulator

Cold: the app force-stopped, no Activity, no JS, only the cached tree on disk.

```
==car: restored a cached tree with 41 parents
==car: automotive: owning the session, nothing else here can
==car: onGetRoot from com.android.car.media -> allowed
==car: onLoadChildren root    -> 3 items  (tokenSet=true)
==car: onLoadChildren songs   -> 49 items (tokenSet=true)
==car: onLoadChildren artists -> 37 items (tokenSet=true)
==car: onLoadChildren artist:Ablekid -> 1 items (tokenSet=true)
```

On the head unit: three tabs — Songs, Favorites, Artists — the playlist under Songs, and
Artists → Ablekid → `Waveforms August 2026` with a title and a back arrow. All of it with no
phone in the system at all, and with real covers on the rows rather than the coloured squares
the car draws when it cannot load one.

Transport, with the app running so JS is there to answer:

```
ReactNativeJS: '==car: command', 'resume'      ← play, pressed on the car's own transport
==car: onLoadChildren root  -> 3 items         ← and the tree republished after it
```

With JS NOT running, the same press is refused loudly rather than silently:

```
==car: command play dropped: no JS runtime to handle it
```

That is the honest state of it: browsing works cold, transport works while the app is alive. A
head unit that has never had the app opened can read the library and cannot start it. Waking the
JS runtime from the browse service is the next step and a feature of its own.

The phone path is unchanged and was re-checked: `pm list features | grep automotive` is empty on
the phone emulator, so none of the session code above runs there.


---

## Verified

**Driving the CarPlay simulator without a human.** `xcrun simctl` cannot tap, but the Simulator's
own windows can be clicked through `CGEventPost` — System Events' `click at` delivers into the AX
hierarchy, which the simulated screen is not part of. Two things make it reliable:

- The content rect comes from the window's AX group, not from arithmetic on the window frame:
  `group 1 of (first window whose name contains "CarPlay")` reports `(1019, -705) 400x240` for an
  800x480 display — a clean 50%, so a screenshot pixel maps to `origin + px/2`. Guessing at title
  bar and border heights instead gave a mapping that was wrong by 10-15 pt and missed every time.
- Post a `mouseMoved` before the click. `CGWarpMouseCursorPosition` relocates the cursor without
  telling anyone, and a view that tracks hover never learns the pointer arrived.

Enable the display by clicking the menu, which IS in the AX hierarchy:
`I/O → External Displays → CarPlay`, then find it with
`xcrun simctl io <dev> enumerate` (`Display class: 1`) and shoot it with
`xcrun simctl io <dev> screenshot --display <uuid>`.

**CarPlay — on the CarPlay simulator, by screenshot at every step.** Enable it with Simulator →
I/O → External Displays → CarPlay; the framebuffer is then a separate display port that
`xcrun simctl io <dev> screenshot --display <uuid>` can capture. Clicks had to be posted through
CoreGraphics (`CGEventPost`); System Events `click at` did not deliver.

```
[carplayframework] Application declares audio entitlement.
[carplayframework] App supports CPTemplateApplicationScene method without window
```

- app icon on the CarPlay dashboard, alongside Messages and Now Playing
- three tabs, correct titles and SF Symbols (`music.note.list`, `heart.fill`, `music.mic`)
- queue with the playing row marked — `Dance to my Beat August 2026 / Zima Blue`
- Artists listing real artists with artwork and track counts (`Ablekid — 1 track`,
  `Addliss — 2 tracks`, …), each with a disclosure chevron
- Artists → Ablekid: the pushed list is **titled `Ablekid`**, with a working `‹ Artists` back
  button. Before the fix in "Fixed while closing the milestone" that title was empty on every
  artist screen.
- tap a track → Now Playing populated from `MPNowPlayingInfoCenter`: title, artist, album,
  transport and a `-1:01:10` scrubber, and JS goes `buffering` → `playing`
- after the Songs change: the first tab lists the phone's playlist — `Feelin FRISKY August 2026`
  by Mantal Frank, Bardeeya, Minor Unit — the same rows, in the same order, as the phone's Songs
  screen

On the watch, the same change: the Playlist screen lists the phone's playlist rather than a
one-item queue, and tapping a row loads it and marks that row with a speaker glyph.

**The risk gate** was closed before any templates were written: with the scene manifest in place
the app still boots and JS still runs (proved by the notification permission dialog, which needs
both a key window and app code executing).

**Android Auto — as far as is possible without a head unit:**

```
:car:assembleDebug                BUILD SUCCESSFUL
merged app manifest               service + intent-filter + meta-data + automotive_app_desc (all 4)
cmd package query-services        name=expo.modules.car.CarBrowserService
                                  packageName=com.envarg.visky enabled=true exported=true
dumpsys activity services         live ServiceRecord, no ClassNotFound
```

The last two are exactly what Android Auto scans for.

**A Release build, which is the one that ships.** Everything above was Debug, and the one thing
that could only fail in Release was the dead-strip in Part F.5. Built with signing off, so it
proves the link and the bundle without needing a profile:

```
xcodebuild -workspace ios/visky.xcworkspace -scheme visky -configuration Release \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

```
** BUILD SUCCEEDED **                            0 errors

nm visky.app/visky | grep ViskyCarPlaySceneDelegate
  _OBJC_CLASS_$_ViskyCarPlaySceneDelegate        ← survived -dead_strip
  _OBJC_METACLASS_$_ViskyCarPlaySceneDelegate

visky.app/Watch/viskyWatch.app                   1.2M
  DTPlatformName                  watchsimulator
  CFBundleIdentifier              com.envarg.visky.watchkitapp
  WKCompanionAppBundleIdentifier  com.envarg.visky
  CFBundleVersion / Short         1 / 1.0.0      ← equal to the phone app's, which Apple requires

visky.app/Info.plist
  UISceneConfigurations           CPTemplateApplicationSceneSessionRoleApplication only
  UIWindowSceneSessionRoleApplication  absent    ← the risk gate, still absent in Release
```

`tsc --noEmit` is clean apart from the two pre-existing errors in `MovingText.tsx` and
`TrackShortcutsMenu.tsx`. `:car:assembleDebug` is still `BUILD SUCCESSFUL` after the Kotlin
changes below.

**On the simulators, after the scene fix.**

iPhone 16 Pro (iOS 18.5): the Songs list renders with artwork, favourite hearts and dates, and
the miniplayer carries all four controls including the previous button Part A added. The CarPlay
dashboard lists visky next to Messages and Now Playing, with both scene roles declared — so
claiming the phone's scene did not cost the car its own.

Android 14 emulator: the same screen, the same four tabs, and

```
dumpsys package        com.envarg.visky/expo.modules.car.CarBrowserService
                       Action: "android.media.browse.MediaBrowserService"
logcat ==car           onGetRoot from com.google.android.bluetooth -> denied
```

That second line is the browse service alive, reached by a real caller from another process, and
the `onGetRoot` allowlist turning away a package that is not on it. It is the first runtime
evidence for either.

Redaction, on both platforms:

```
"x-auth-token": "«redacted 220»", "x-auth-secret": "«redacted 18»", "push_token": "«redacted 41»"
```

---

## Not verified

- **Android Auto (projection) at runtime.** Automotive OS now works end to end (Part G), but that
  is a different platform. The Desktop Head Unit gets further than last time and still does not
  close the loop. What now works:

  ```
  sdkmanager "extras;google;auto"            desktop-head-unit 2.0-mac-arm64
  AVD from android-30 google_apis_playstore  ships com.google.android.projection.gearhead 5.3
  Android Auto → tap Version x10 → OK        developer settings unlocked
  overflow → Start head unit server          notification: "Head unit server running", :::5277 LISTEN
  adb forward tcp:5277 tcp:5277
  ./desktop-head-unit < fifo                 [I]: connected.
  ```

  The DHU must be run with stdin held open — it is an interactive console and exits immediately
  under `nohup` with a closed stdin, which looks exactly like a crash. A FIFO with a long-running
  writer keeps it alive.

  The TCP session establishes and the head unit then sits on **"Waiting for phone…"** for ever.
  The phone's side says why:

  ```
  GH.FRX  FAILED event: EVENT_CAR_DISCONNECTED
  GH.FRX  finishSetup isOptedIn=false, hasError=false
  CAR.SERVICE.FCD  timed out at stage FIRST_ACTIVITY_LAUNCHED, publishing PROJECTION_NOT_STARTED
  ```

  Android Auto accepts the socket and never brings up a car session. The version on the image is
  from 2020 and the DHU build is from 2022; Play Store will not close the gap —
  *"This app isn't compatible with your device anymore"* — because modern Android Auto no longer
  ships to an API 30 emulator. So this particular route is closed, not merely unfinished.

  The route that DID get somewhere is an **Android Automotive OS** image
  (`system-images;android-34-ext9;android-automotive;arm64-v8a`, device
  `automotive_1024p_landscape`) — a car OS rather than a projection target, which hosts
  `MediaBrowserService` apps directly. See Part G.

  Still unproven on projection specifically: the reflection yielding react-native-track-player's
  session token on a phone. Serving the tree and transport from a head unit are both proven now,
  on Automotive OS.
- **Starting the app from the car.** On Automotive OS a head unit that has never had visky opened
  can browse the cached library and cannot start playback: the transport command has no JS
  runtime to reach. Logged as `command … dropped: no JS runtime to handle it`. Waking JS headlessly
  from the browse service is a feature of its own — `setupPlayer` currently runs from the React
  root layout, not from the playback service, so starting RNTP's `HeadlessJsTaskService` would not
  be enough on its own. The emulator run could not get
  there: the debug APK fell back to `loadJSBundleFromAssets` instead of Metro, so `setupPlayer`
  never ran and RNTP owned no session to adopt. Unproven: `onGetRoot`/`onLoadChildren` serving a
  real head unit, the reflection yielding the token, transport commands from the car.
- **Playback from the car has only been exercised on the simulator**, with the phone's own
  session.
- **The build number the watch app ships with under remote versioning.** Apple rejects a bundle
  whose embedded watch app disagrees with the host on `CFBundleVersion`, and `eas.json` has
  `appVersionSource: remote` with `autoIncrement`. At prebuild the two agree (verified above),
  and EAS's `updateNativeVersionsAsync` writes the resolved number into *every* target's
  Info.plist — but that walk depends on the watch target being discovered through the
  `PBXTargetDependency` the plugin creates, and that has never been observed on a real store
  build. First thing to check in the first `.ipa`:
  ```
  unzip -p build.ipa 'Payload/*.app/Info.plist' | plutil -p - | grep CFBundleVersion
  unzip -p build.ipa 'Payload/*.app/Watch/*.app/Info.plist' | plutil -p - | grep CFBundleVersion
  ```

---

## Files

```
app/modules/car/                     shared tree format, iOS Swift, Android Kotlin
  src/Car.types.ts                   the wire format, single source
  src/CarModule.ts                   JS facade over the optional native module
  ios/CarModule.swift                CarLink singleton + Expo module shell
  ios/CarPlaySceneDelegate.swift     CPTabBarTemplate / CPListTemplate / artwork cache
  android/.../CarLink.kt             same singleton, same responsibilities
  android/.../CarModule.kt           Expo module shell
  android/.../CarBrowserService.kt   MediaBrowserServiceCompat + the reflection
  android/.../automotive_app_desc.xml
app/plugins/withCarPlay.js           scene manifest (entitlement lives in app.json)
app/src/services/car.ts              tree building, command handling
app/src/hooks/useSeekGestures.tsx    hold-to-scrub

modified: app.json (plugin registered), src/app/_layout.tsx (startCarLink at app start),
          src/components/PlayerRegisterService.tsx, src/components/PlayerControls.tsx,
          src/components/FloatingPlayer.tsx
```

---

## Open, and what to do next

**1. The Apple account is the blocker, and it is not a signing problem.**

The plan was to regenerate the provisioning profiles: 04 recorded the rule for
MusicKit/ShazamKit — **changing capabilities invalidates every existing profile**, because a
profile is an immutable signed snapshot. Every profile this project has predates Apple's CarPlay
grant and therefore lacks `com.apple.developer.carplay-audio`, so signing would fail with

```
Provisioning profile "..." doesn't include the com.apple.developer.carplay-audio entitlement.
```

The simulator never catches this — it does not check entitlements at all.

`eas credentials -p ios` was run, and it does not get that far. Apple ID, password and 2FA all
pass, the team resolves, and then:

```
Team Evgeny Nesterov (N853W9Q344)
Authentication with Apple Developer Portal failed!
AssertionError [ERR_ASSERTION]: An unexpected error occurred while completing authentication
    at loginWithUserCredentialsAsync (eas-cli/build/credentials/ios/appstore/authenticate.js:92)
```

That assert is `assert(newSession, …)` on the return of
`@expo/apple-utils`' `Auth.loginWithUserCredentialsAsync`. It is not an eas-cli bug. Signing in
to App Store Connect by hand gives the reason:

```
Your Apple Account isn't enabled for App Store Connect.
https://appstoreconnect.apple.com/m/INVALIDITCUSER
```

**The session eas-cli needs is an App Store Connect session** — `apple-utils` authenticates
through olympus, which is App Store Connect — so an Apple ID with no App Store Connect user
record cannot produce one, and it returns null instead. developer.apple.com itself is fine: the
team exists, the CarPlay entitlement was granted against it, and Developer ID certificates were
issued from it in 04.

Two consequences, and they are different:

- **TestFlight and the App Store are blocked** until the account is enabled for App Store
  Connect. Nothing in this repo can work around that.
- **A signed build for a real iPhone is not blocked.** Provisioning profiles come from the
  Developer Portal, which works. The route around the crash:
  1. `npx eas-cli credentials -p ios` and answer **no** to *"Do you want to log in to your Apple
     account?"* — that prompt is optional and is the only thing that crashes.
  2. Make the certificate and both profiles in Xcode, which talks to the Developer Portal and
     never touches App Store Connect: Settings → Accounts → `en.varg@me.com`, then automatic
     signing on the `visky` and `viskyWatch` targets. Generated *after* the grant, so the
     CarPlay entitlement is in them.
  3. Hand the `.p12` and the `.mobileprovision` files to `eas credentials` manually.

Also worth knowing: `-e`/`--profile` does not exist on this command in eas-cli 23 — only `-p`.
The build profile is the first interactive question.

Verify the profile by fact, not by faith:

```bash
unzip -p build.ipa 'Payload/*.app/embedded.mobileprovision' \
  | security cms -D | plutil -p - | grep carplay
```

**Why none of this can be automated.** `certs/AuthKey_*.p8` is an **APNs** key, not an App Store
Connect one (04, "Still open on signing"). A real ASC API key would make `eas credentials`
non-interactive for good — eas-cli reads `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`,
`EXPO_ASC_ISSUER_ID` and `EXPO_APPLE_TEAM_ID` (`credentials/ios/appstore/resolveCredentials.js`)
— but issuing one requires App Store Connect, which is the thing that is missing. The stored
fastlane session `~/.app-store/auth/en.varg@me.com/cookie` dates from Sep 2024 and is dead.

Accounts, since they are easy to mix up: **iOS is `en.varg@me.com`, Android is
`en.varg@gmail.com`** — the latter is also the everyday email, which is the wrong guess for
anything Apple.

**2. The `ios/` force-add question is settled: no.** The plugin stays and `ios/` stays generated,
for the reason in Part B — EAS prebuilds on every cloud build, so a hand-edited `ios/` vanishes
on the one machine that builds releases, and committing `ios/` wholesale stops the prebuild and
silently disables every config plugin including `withVkTrustAnchor`. `app/.gitignore`'s
`!app.config.js` is fine as it stands: `git check-ignore` confirms the negation wins, and the
file holds no secrets.

`app/watch/`, `app/modules/` and `app/plugins/` are still **untracked**, which is a loose end but
not a build blocker: `eas.json` does not set `requireCommit`, and with it false eas-cli copies
the working tree over the shallow clone (`vcs/clients/git.js`, `makeShallowCopyAsync`), so
untracked files do reach the builder. `.easignore` excludes only `ios/**` and `android/**`.
They should still be committed before the first store build.

**3. Android Auto still needs the Desktop Head Unit**, and the watch still needs real hardware.
Both are unchanged from "Not verified" above.

---

## Fixed while closing the milestone

Everything here was found by reading, not by a failing build — none of it changed a build log.

- **The CarPlay scene delegate could be dead-stripped in Release.** Part F.5; now anchored and
  verified with `nm`.
- **A pushed artist list had no title.** `CarPlaySceneDelegate.select` looked the tapped row up in
  `nodes(under: "root")`, which only ever holds the three tabs — and tabs are never pushed. Every
  artist screen therefore opened with an empty navigation title. `CarLink.node(withId:)` now
  finds a node wherever it sits.
- **The watch had the same `as? Int` version gate that Part F.2 had already cost an afternoon
  for.** `watch/WatchLink.swift` read `payload["v"] as? Int`; a JS number that arrives as a
  double fails that cast, inside a `guard`, silently. Now read through `NSNumber` and logged on
  rejection, matching the car.
- **A `#` in an artist name or a track URL broke the node id.** `carTrackId` joined
  `${containerId}#${trackKey}` and parsing split on the first `#` — but an artist container is
  `artist:${name}`, names are arbitrary, and a track key falls back to the track's URL, which can
  carry a fragment. The container half is now percent-encoded, which makes the first `#` the
  separator by construction. The id is opaque to both native halves, so this is not a wire format
  change.
- **`CarLink.publish` on Android accepted any shape.** `as? Map<String, List<Map<String, Any?>>>`
  is erased to a bare `Map` check and always succeeds, so a wrong shape survived `publish()` and
  would surface later as a `ClassCastException` inside a system callback. Parsed element-wise
  now, like the Swift half, and it logs which half it rejected.
- **`notifyChildrenChanged` skipped the screen the driver was actually on.** It fired for the root
  and the three tabs only, so an artist's track list — the one node reached by pushing — never
  redrew. The service now tracks every parent it has answered for and notifies those.
- **The phone app had no visible UI at all**, on every platform build, because of this
  milestone's own scene manifest. Part F.6.
- **The first tab was the player's queue, not the playlist.** It was titled "Now playing" and
  listed whatever `TrackPlayer.getQueue()` held — usually one track. A driver who opens the app
  wants the list that is on the phone, and the Now Playing screen already exists as its own
  CarPlay template. The root is now `songs`, titled **Songs**, fed by the same playlist the app's
  own Songs tab shows, so the car mirrors the three phone tabs: Songs, Favorites, Artists. The
  watch's Playlist screen was the same mistake and got the same fix — it listed the queue and now
  lists the playlist, falling back to the queue only on a fresh install that has never opened the
  tab. Tapping a row on either surface skips within the queue when the track is already loaded,
  and otherwise loads that list and starts there.
- **Favorites and Artists in the car were empty on every trip.** `services/car.ts` built them
  from `useLibraryStore`, whose `tracks` resolve from the MMKV key `'tracks'` — which nothing has
  written since the tabs moved to windowed loading. It resolved to `[]`, silently, because an
  empty list is a valid list. The tree now reads the same two keys the app's own screens seed
  themselves from, `songs-window` and `favorites-window`, which are the only current picture of
  what the user is looking at. Both keys moved to `store/library.tsx` so the screens and the car
  share one definition. This is the same failure the note about `rating === 1` in
  `store/favorites` warns about, made a second time in the same file — reading a field nobody
  maintains, and it is only visible from a head unit.
- **The first API call of every cold start went out unauthenticated.** `SessionProvider` mirrored
  the stored session into the network layer's headers from a `useEffect` — and React runs a
  CHILD's effects before its parent's, so the songs screen had already fired its first request by
  the time the headers existed. The API answered `403 No token or secret`, the loader swallowed
  it (`useWindowedTracks`: `console.warn('Unable to load the first page')`), and the first screen
  stayed empty until something refreshed it. Now set during render — `useMemo` — because that is
  the only place early enough to beat the children, and because `setAuthHeaders` assigns a
  module-level record and touches no React state, so it is safe there. Verified on both platforms:
  the first `GET /playlist/frisky` now carries `x-auth-token`, `x-auth-secret`, `x-auth-device`
  and `x-auth-user`, and 49 tracks land.
- **A second place printed credentials.** `(app)/_layout.tsx` logged the whole session object on
  every render of the authenticated layout, VK `access_token` and audio-signing `secret`
  included. Now logs `user_id` and `device_id` only.
- **Request logging printed credentials.** `==apiRequest config` and both axios interceptors
  logged whole config and response objects, so `x-auth-token`, `x-auth-secret` and the VK
  `access_token` landed in Metro output and in any log file redirected from it. `network.tsx` now
  redacts by key name, depth-capped, keeping the length so "wrong token" and "no token" stay
  distinguishable. (Item 4 of the previous list; `==setAuthHeaders` was already logging only
  keys.)
- **The CarPlay entitlement moved to `app.json → ios.entitlements`**, per 04's convention. The
  scene manifest stayed in the plugin, because the "do not declare
  `UIWindowSceneSessionRoleApplication`" rule needs the comment beside it and JSON has nowhere to
  put one. Verified after a `--clean` prebuild: the entitlement still lands in
  `ios/visky/visky.entitlements`, and `expo.ios.entitlements` wins over the file's own contents
  (`config-plugins/build/plugins/withIosBaseMods.js`).

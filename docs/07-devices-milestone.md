# 07 — Onto real hardware, and what broke on the way

Full record of the milestone, so the work can be resumed. Started 2026-09-01.

Milestone 06 built pairing and left three things open, the first two of which were the same
sentence in different words: *deploy the API*, and *build the app natively, because an OTA cannot
carry a new permission*. This milestone is the attempt to do that — and the attempt is most of
the story, because almost nothing about it went the way the plan assumed.

The short version: **the reported bug was a build artefact, not code.** The scanner crashed
because the native project on disk had been generated before `expo-camera` was added to
`app.json`, so the permission never reached either manifest. Everything else here is what it took
to get a corrected build onto a seven-year-old phone, plus a production outage that happened in
the middle and two regressions found on the way.

---

## Goal

1. **Fix the crash** reported as *"при открытии камеры чтоб отсканировать QR приложение падает"*.
2. **Get a build onto a real Android device** and onto a real iPhone, from the console.
3. **Deploy the API**, so `/api/pair` exists.
4. **Verify the scanner on hardware** — not in a simulator, because a simulator has no camera.

---

## Part A — The crash

### What it was

`ios/` and `android/` are generated directories. `.gitignore` lines 389–390:

```
ios/**
android/**
```

They are rebuilt by `expo prebuild`, which is where config plugins apply their edits. The
`expo-camera` plugin was added to `app.json` in milestone 06, but `prebuild` was never re-run, so
the two files that matter still described an app with no camera:

```
ios/visky/Info.plist            NSFaceIDUsageDescription, and nothing else
android/.../AndroidManifest.xml INTERNET, VIBRATE, storage — no CAMERA
```

`Podfile.lock` *did* contain `ExpoCamera (57.0.4)`, which is what made this confusing: autolinking
picked the module up the moment it appeared in `node_modules`, so the JS compiled and ran and the
native module was present. Only the Info.plist mod was missing. On iOS that is not a soft failure
— the system kills the process the instant `AVCaptureDevice` is touched without a usage
description. It is a SIGABRT from outside the app, which is why it looked like an unexplained
crash rather than a JS exception.

### Why an OTA could not have fixed it

Permissions live in the native binary. `expo-updates` replaces the JS bundle and nothing else. Any
fix had to be a full rebuild — which is the same rebuild milestone 05 needed for CarPlay and the
watch, so the two were done in one pass.

### The fix

`npx expo prebuild --clean`. Safe here because every hand-written native source lives outside the
generated directories — `modules/car/ios/CarPlaySceneDelegate.swift`, `plugins/*.js`, `watch/*` —
and all three config plugins re-applied cleanly: the CarPlay entitlement, the watch target and the
VK trust anchor were all present afterwards.

```
ios/visky/Info.plist            NSCameraUsageDescription  ✓  (no microphone: the plugin is
                                                              configured microphonePermission:false)
android/.../AndroidManifest.xml android.permission.CAMERA ✓  (no RECORD_AUDIO)
```

---

## Part B — Getting a build onto a Galaxy Note 8

This took longer than the fix. Recorded in full because every obstacle will recur.

### The port is corroded

`adb devices` was empty while `ioreg` showed the phone was not on the bus at all. Once it did
enumerate, the interface descriptors explained the rest:

```
255/255/1   vendor (MTP)
2/2/1       CDC ACM
10/0/0      CDC data
```

ADB is `255/66/1`. Absent — USB debugging was off. Enabling it is seven taps on Build number and
cannot be done remotely: the only remote path is adb, which needs the thing being enabled.

Then Samsung's moisture/corrosion detector fired — *"unplug charger immediately"* — which blocks
both charging and data on that port. There is no toggle for it in One UI; it is a hardware
detection, and a rusty contact under load is what it is for.

### Android 9 has no wireless pairing

The pairing-code flow (Settings → Wireless debugging → pair with code) is **Android 11+**. The
Note 8 tops out at Android 9 / API 28. The only route to wireless adb there is `adb tcpip`, which
needs one working USB connection first — so the corroded port had to work exactly once.

It did:

```bash
adb -s ce071717e196d21d057e tcpip 5555
adb connect 192.168.1.234:5555
```

After that the cable is unnecessary — install, logcat, screencap and `input tap` all run over the
network. **It does not survive a reboot**: `persist.adb.tcp.port` cannot be set without root
(`shell` is uid 2000, SELinux denies it), so a reboot costs one more cable touch.

### Two install failures, in order

**`INSTALL_FAILED_VERSION_DOWNGRADE`.** `eas.json` sets `appVersionSource: remote`, so EAS assigns
version codes and the local `prebuild` writes `versionCode 1`. The phone had 66. `adb install -d`
does not help on Android 9 — that flag only permits downgrades for debuggable packages. Fixed by
setting `expo.android.versionCode` in `app.json`.

**`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.** Only after the version check passed did the real blocker
appear: signatures. `dumpsys` gave the reason —

```
installerPackageName=com.android.vending
```

— the installed app came from **Google Play**, so it carries a Play App Signing key that cannot be
reproduced locally. There is no Android keystore in `certs/` (Apple certificates only) and no
`credentials.json`. Installing over a Play build is impossible by construction; the choice is a
separate package id or an uninstall.

Worth noting for next time: the first error masked the second. `VERSION_DOWNGRADE` is reported
before signatures are compared, so "the versions differ" and "the keys differ" cannot be
distinguished until the first is fixed.

### The uninstall was cheaper than expected

Uninstalling loses app data, which meant losing the VK session and needing a password re-login —
the thing that provokes VK flood control. It turned out not to matter: `AndroidManifest` carries
`ALLOW_BACKUP`, and Android auto-backup restored the session on reinstall. The app came up signed
in.

Do not rely on this. It is Google's backup, on Google's schedule.

---

## Part C — The production outage

Deploying the API took the site down for roughly twenty minutes. This is the part most worth
reading later.

### Timeline

```
13:41:33  vault-agent-init starts for the new pod on node mini-n
13:41:49  last kubelet heartbeat from mini-n
13:45:02  the visky-api container finally starts
13:46:27  mini-n marked NotReady — "Kubelet stopped posting node status"
          both pods evicted; replacements Pending, unschedulable
          visky-api endpoints: <none>; Traefik serves its own 404
```

### Two things I got wrong, recorded because the reasoning was plausible and false

**First**, I read the failure as memory pressure — two pods with two vault sidecars on a node with
979Mi allocatable, dying 16 seconds after the second pod landed. The user's monitoring said
otherwise: a Node.js **infinite loop at 100% CPU**, hanging kubelet badly enough that Prometheus
could not scrape it. `TargetDown` and `KubePodNotReady`, not an OOM. The timing coincidence was
persuasive and wrong.

**Second**, the timeline does not support blaming the new image either. At 13:41:49, when the
heartbeat stopped, the only application code running was the **old** pod — the new container did
not start until 13:45. And when the new image later ran on a healthy node it reached `2/2 Running`
in about forty seconds. Whatever was spinning, it was not 1.5.41's startup.

The honest conclusion is that the deploy landed in the window rather than opening it, and which
process burned the CPU is a question for Prometheus, not for this document.

### What actually made it an outage

The deployment is pinned to a single node:

```
nodeSelector: {"kubernetes.io/hostname": "mini-n"}
```

so when that node died the scheduler had nowhere to put the replacement:

```
0/9 nodes are available:
  1 node(s) had untolerated taint {node.kubernetes.io/unreachable}
  8 node(s) didn't match Pod's node affinity/selector
```

Eight healthy nodes, six of them the right architecture, all excluded. The pin exists for a real
reason — the image is `linux/amd64` and half the cluster is arm64 Ampere — but `hostname` is a far
narrower selector than `kubernetes.io/arch`, and the pod is stateless: no volumes, no PVCs, nothing
tying it to that disk. **This is still open.** The node came back before the migration completed,
and the pin was left as it was on the user's instruction.

### Recovery

Rolled the image back to 1.5.40 — the exact image that had served for five days — restored
`replicas: 1`, and the service returned:

```
GET /                -> 200
GET /api/playlist    -> 403   (auth required; correct)
GET /api/pair        -> 404   (expected: 1.5.40 predates pairing)
```

### Two fixes that came out of it

**`deploy-api.sh` waited 120s.** The vault-agent init container alone took 3m34s that day, so the
script reported a failure while Kubernetes was rolling out normally — and a spurious failure during
an incident is worse than no check at all. Now `${ROLLOUT_TIMEOUT:-600s}`.

**The Helm chart had no `strategy` block.** Helm therefore fell back to the 25%/25% default. For a
single replica that rounds to `maxSurge 1 / maxUnavailable 0`, which is the desired blue/green
behaviour — but by arithmetic coincidence, not by intent. Now spelled out in `values.yaml` and
rendered by the template. The cost is stated in the comment there: two pods coexist during a
rollout, both on the one node the selector names.

---

## Part D — The O(n²) regression

Found while reading the diff between the deployed image and HEAD, not by a failing test.

Milestone 06's commit rewrote `sortLocalPartTracks` to key part-groups on artist + title + air
date, fixing the bug where two artists in the same weekly slot interleaved. The rewrite turned an
O(1) `Map` lookup into a linear scan of every group ever opened for that key:

```ts
const opened = groups.get(key);
const group = opened?.find((candidate) => ...);   // O(groups) per item
```

The function's own comment says the search route "sorts the whole catalogue at once", and a slot
one artist has held weekly for years gives a single key hundreds of groups. That is quadratic in
the catalogue — and from outside, a long quadratic pass is indistinguishable from a hang.

### The fix

Index the groups by `floor(anchor / PART_GROUP_WINDOW_S)`. Two dates less than a window apart are
always in the same bucket or in adjacent ones, so a lookup reads three buckets instead of walking
the list. Lookup is O(1); the pass is linear again.

The old tie-break is preserved exactly — when several groups are in range, the earliest-opened one
wins — by giving each group an `order` and taking the minimum, which is what `Array.find` over an
insertion-ordered list was doing implicitly.

The dateless case needed an argument rather than a mechanism. An item with no date matches any
group, so it only ever *creates* a group when the key has none — meaning an anchorless group can
only be a key's first. That is why `findPartGroup` can answer both dateless questions with
`slot.first` and never scan.

### Three tests added

- two parts exactly one window apart group together. `1756000000` and `+86400` sit in buckets
  20324 and 20325, so this fails if the neighbour scan is dropped — it is the test that guards the
  fix rather than the feature;
- one second beyond the window splits them;
- 200 weekly editions of one slot by one artist stay 200 separate pairs.

`144/144` after, up from 141.

---

## Part E — The miniplayer swallowed the buttons

Found on the device, not in review. The Devices screen ended with a flat `paddingBottom: 48`,
while every scrolling screen in the app uses `layout.tabBarContentHeight + 80`. The three actions —
*Add a device*, *Show my code*, *Copy link* — rendered underneath the floating player, and a tap
there reached the player instead. The screen also did not scroll, because its content ended
exactly at the fold, so there was no way to reach them at all.

The screenshots are the record: before the fix the button labels are faintly visible *through* the
miniplayer.

---

## Part F — Android Auto: the opt-in is on the service

Milestone 05 left one item open: verify the car at runtime with the Desktop Head Unit. That
route turned out to be shut, and the detour found a real bug.

### The DHU is unreachable, for a reason that is not ours

DHU talks to the **Android Auto app on the phone**, and Play refuses to install it:

> Android Auto — Google LLC
> ⚠ This item isn't available in your country.

The device is plainly in Finland (`gsm.operator.iso-country = fi`, `Europe/Helsinki`), so this is
the Google **account** country, which adb cannot read. Android Auto *is* offered in Finland, so
the account is set to somewhere it is not. Changing a Play country needs a payment profile in the
new country and is allowed once a year — not a step to spend on this.

The `AA_Play_API30` AVD is no escape either: `PlayStore.enabled = no`, and the same account would
hit the same block.

### Android Automotive needs no such app, and is the better test anyway

On AAOS the car **is** the Android device: our APK installs directly, no projection, no phone.
Both AVDs are `arm64-v8a` and the APK ships that ABI, so it just installs.

First result: the app appeared in the car's launcher and its service resolved as one of the five
media browser services on the system —

```
expo.modules.car.CarBrowserService
```

— and yet it was **absent from the media source list**, with this in the log:

```
D MediaSource: No opt-in info found for Component
               ComponentInfo{com.envarg.visky/expo.modules.car.CarBrowserService}
D MediaSource: Skipping MBS for ComponentInfo{...}
               belonging to non media template app com.envarg.visky
```

### What it was

Ruled out in order: the descriptor (`<automotiveApp><uses name="media"/></automotiveApp>` is
verbatim correct inside the APK); the resource id (`0x7f150000` really is `xml/automotive_app_desc`);
both application-level metadata keys (`com.google.android.gms.car.application` and
`com.android.automotive`, both present, both pointing at that resource); the AAOS multi-user model
(the launcher logging this runs as `u10_a167`, the app is installed for users 0 and 10, current
user is 10); the OEM allowlist (`custom_media_packages` holds only Radio and the projection
receiver, so it is not how the built-in sources get in); and moving the descriptor metadata onto
the service, which changed nothing.

The answer came from AOSP's own `LocalMediaPlayer`, which the car accepts. Its manifest has **no**
`com.android.automotive` at all. What it has, on the **service**, is:

```xml
<meta-data android:name="androidx.car.app.launchable" android:value="true" />
```

That is the opt-in the log means, and the message says so — it names a *Component*, not a package.
Two application-level descriptors are what Android Auto reads; Android Automotive reads this, off
the service.

### Verified after the fix

```
D MediaSource: MBS for ComponentInfo{com.envarg.visky/expo.modules.car.CarBrowserService}
               is opted in
```

Zero skip lines after a clean boot, visky is the fifth entry in the media source list beside
Bluetooth Audio, Local Media, News and Radio, and selecting it renders the browse tree — Songs /
Favorites / Artists with real tracks and artists.

Not verified here: playback itself, and projection through the DHU, which stays blocked by
the Play region. (The note that first stood here — that album art fell back to placeholders
— was wrong; see Part H.)

---

## Part G — "Loading content…", and the four walls behind it

Tapping a track in the car did nothing: the browse list was right, the now-playing
screen said *Loading content…* for ever. Four separate causes, each hidden behind the
one in front of it.

### 1. The command was dropped

```
W ==car: command play dropped: no JS runtime to handle it
```

`CarLink.onCommand` is set in the module's `OnStartObserving`, which needs JS to have
subscribed. On Automotive the car starts the browse service from a cold boot: the tree
comes off disk (that is why real tracks appeared with nothing running) and there is no
runtime to act on a tap. The diagnostic that made this a two-minute diagnosis was already
in the code, written when the gap was predicted.

Now the command is **held** in `CarLink` — one slot, because during a start the driver
meant the last thing they touched — and delivered from the `onCommand` setter the moment
the module attaches.

### 2. Nothing started a runtime

`CarBrowserService` now starts one: `ReactHost.start()`, the sanctioned headless boot, no
Activity in front of a driver. Reached reflectively, for the same reason `rntpSessionToken`
is reflective — the module compiles as a plain Android library with React off its classpath.

### 3. The runtime booted and still nobody listened

`startCarLink()` had two call sites: the root layout, which needs a mounted tree, and the
playback service, which `useSetupTrackPlayer` only registers from a hook. In a headless
runtime neither runs.

Fixed with an `index.js` entry — the one call site that exists in *every* runtime. Safe
rather than convenient: `startCarLink` is idempotent, no-ops without the native module, and
its own comment already said whichever call lands first wins.

### 4. The player refused to exist

```
Error: On Android the app must be in the foreground when setting up the player.
code: 'android_cannot_setup_player_in_background'
```

Two things were wrong. `setupPlayer` was private to the hook, so the car had no way to ask
for it — lifted into `services/trackPlayer.ts` as `ensureTrackPlayer()`, memoised per
runtime, registering the playback service through a lazy `require` to break the
car → trackPlayer → PlayerRegisterService → car import cycle.

And RNTP's guard itself. Promoting `CarBrowserService` to a foreground service did not
satisfy it, because `AppForegroundTracker` counts **activities** — it observes
`ProcessLifecycleOwner`'s resume/pause and nothing else, so a process running a foreground
service still reads as backgrounded. This is not an emulator artefact: in a real car the
foreground belongs to `com.android.car.media` and our process never is.

Patched (the repo already patches this package) to also accept a process whose importance
is `IMPORTANCE_FOREGROUND_SERVICE` or better — which is exactly the condition under which
starting a foreground service is legal, so the `ForegroundServiceDidNotStartInTimeException`
the guard exists to prevent cannot occur. The car grants the window itself:

```
Background started FGS: Allowed ... code:TEMP_ALLOWED_WHILE_IN_USE
tempAllowListReason:<MediaSessionRecord..., duration:10000>
```

`CarBrowserService` holds the foreground across the boot and releases it as soon as
track-player's own service appears, with a 60 s timer so a failed start cannot strand a
notification.

*(Note for next time: `npx patch-package` swept `node_modules/.../android/build/` into the
patch — 88k lines. Regenerate with `--exclude '(^|/)build/'`.)*

### And one more, after the audio was already playing

The car still showed *Loading content…* while ExoPlayer held audio focus, because our
session had nothing to mirror. The token search is bounded on purpose — a driver who only
browses must not be polled all trip — and `bindService` is called without a CREATE flag, so
once it gives up nothing remains to fire `onServiceConnected` when track-player finally
starts. A car command is the signal that playback is imminent, so it now re-arms the search.

### Verified

From a cold `am force-stop`, tapping a track in the AAOS media list:

```
W ==car: command play held: no JS runtime yet, starting one
I ==car: holding the foreground so the player can be created
I ==car: delivering the command held while the runtime was starting
I ==car: automotive: mirroring track-player's state into our session
I ==car: released the foreground

state=PlaybackState {state=PLAYING(3), buffered position=3630, active item id=0}
metadata: size=6, description=Feelin FRISKY August 2026
```

and the head unit shows the title, `0:00:22 / 1:07:41`, a moving progress bar and live
transport controls.

The phone was re-checked afterwards, because the entry point changed: launches clean, no
crash buffer, `loading → buffering → ready`, playlist window at 49 tracks.

Album art is dealt with in Part H — the reading recorded here first was wrong.

---

## Part H — Album art: half a bug, and a correction

I recorded twice that the `content://` provider was not delivering. That was wrong, and the
mistake is worth keeping because of how it was made: I judged from the first four rows on
screen. Those are `Feelin FRISKY August 2026` — tracks that have no artwork at all, on the
phone exactly as much as in the car. Scrolling two screens down shows real covers on
`Headspace August 2026`, `Plethora Muzik`, `Reimagine Sessions` and the rest. **Browse
artwork was working the whole time.**

There was a real bug next to it, and the wrong reading hid it. The *list* drew a correct
cover for a track while the *now-playing* screen drew a placeholder for that same track.

Two different paths feed those. Browse rows go through `artworkUri`, which was written for
this and hands the car a `content://` uri. Now-playing is fed by the mirrored session
instead, and the mirror copied react-native-track-player's metadata verbatim — including a
remote `https` artwork url, which Automotive's image loader will not fetch. Same cause the
browse path was already built to avoid, on the one path that had been left out.

`localArtwork()` now rewrites the artwork keys in the mirrored metadata the same way, over
`METADATA_KEY_ALBUM_ART_URI`, `METADATA_KEY_ART_URI` and `METADATA_KEY_DISPLAY_ICON_URI`,
prefetching and re-publishing when the bytes land. Metadata went from 8 keys to 10, and the
head unit draws the real cover — and derives its ambient background from it.

---

## Part I — Pairing, against the deployed API

`/api/pair` is live: api **1.5.42** carries both the pairing routes and the quadratic fix from
Part D. The rollout was clean, and the two repairs from Part C earned their place — the 600 s
timeout did not lie about the outcome, and the explicit blue/green strategy held the endpoint up
throughout.

*(A thing worth knowing for the record: 1.5.41 — the image with the quadratic pass — was
redeployed after Part C's rollback and served production for about two hours before 1.5.42
replaced it.)*

### The rendezvous, exercised against the real server

Not supertest. Production, over the internet:

| | |
|---|---|
| `POST /api/pair` | 200, ticket with `pair_id`, `code`, `expires_in: 180` |
| `GET /api/pair/:id/peek` | 200 |
| `GET /api/pair/:code/peek` | 200 |
| `GET /api/pair/6QS0-127F/peek` | 200 — the dash is stripped, so Crockford parsing survives the wire |
| `GET /api/pair/:id` while pending | 204 |
| `GET /api/pair/<unknown>/peek` | 410 |
| `POST /api/pair/:id/claim` with no auth | 403 |

### The typed code, on the Note 8

A slot was opened by curl under the name `MacBook Pro (Chrome)`, the code typed into the sheet by
hand, and the phone came back with

> **Sign in on MacBook Pro (Chrome)?**
> That device gets this VK account — the library, the favourites and playback control… Only do
> this for a screen you own.

which closes the loop phone → API → phone: the name is the one the *other* side registered, fetched
through `peek`, and the app shows whose screen it is before it hands anything over.

**Not confirmed, deliberately.** The next tap sends a real VK session to a slot opened by curl for
a device that does not exist — precisely what the sheet warns against. Cancelled instead, and
`GET /api/pair/:id` answered **204** afterwards: nothing was parked, so cancel really cancels.

### Three older repairs, verified on hardware by accident

- **The scanner remount.** Cancelling the sheet returns to a *live* camera. That is the bug found
  by review in milestone 06 — `key={problem ?? 'scanning'}` would not remount when cancelling
  restored a value that was already there, leaving `delivered.current` true and the camera dead.
  The attempt counter that replaced it works.
- **`formatPairCode`.** The field shows `74F3-PXDS`.
- **The Devices screen padding** from Part E: the three actions are reachable, which is how any of
  this was reached at all.

### One small thing found here

The soft keyboard covers the *Use this code* button. Not a blocker — the keyboard's own Done key
submits, which is how the confirmation above was reached — but the button is unreachable while
typing, and it is the obvious thing to press.

### Verified by the user, off this machine

Scanning the QR shown by the **desktop app** works. That is the milestone's original direction —
the screen that cannot log in displays, the phone reads — and it is the one hop no amount of adb
could reach from here.

---

## Verified

- **The crash is gone.** On the Note 8: the sheet opens, the permission dialog appears, the camera
  starts, the preview streams. Same pid before and after (`25878`), `logcat -b crash` empty,
  `Camera2CameraController ... ControllerState$STARTED` and `CameraId-0` moving to
  `CameraUnavailable` — the process took the camera.
- One benign log line, worth recognising so it is not chased later:
  `NoClassDefFoundError: android/hardware/camera2/CameraExtensionSession$StateCallback`. That class
  is API 31; the Note 8 is API 28. CameraX handles the absence itself and logs at `I`.
- The permission reaches the installed package: `dumpsys` lists `android.permission.CAMERA`.
- Milestone 06's UI corrections hold on real hardware: `Devices › 7 signed in` as a plain menu row,
  red reserved for Logout.
- Wireless install works end to end — `adb install` over `192.168.1.234:5555`, 37s for 132MB.
- API: `144/144`, `tsc --noEmit` clean.
- Production is up on 1.5.40.

## Not verified

- **Phone → phone pairing.** Should work today — that payload carries the credentials and needs no
  server — but it has not been tried.
- **The last hop of the typed-code path.** See Part I: everything up to the confirmation sheet is
  verified, and the sheet was cancelled rather than confirmed, because the "other screen" was a
  slot opened by curl and the sheet's own warning is *only do this for a screen you own*.
- **iOS Release.** The user ran a Release build to the iPhone successfully and added a script for
  it (`yarn iphone`). Whether `ViskyCarPlaySceneDelegate` survives Release dead-stripping is still
  the open question from milestone 05; a Release build now exists to test it on.
- **Android Auto with the Desktop Head Unit** — milestone 05's last open item, still open. It is
  newly *possible*: there is now a real Android device reachable over the network.

---

## Files

| file | |
|---|---|
| `api/src/helper/index.ts` | bucketed group index; `KeySlot`, `bucketOf`, `findPartGroup` |
| `api/src/__tests__/helper/index.test.ts` | three tests for the window boundary and for scale |
| `api/.github/helm/values.yaml` | explicit blue/green `strategy` |
| `api/.github/helm/templates/deployment.yaml` | renders it |
| `scripts/deploy-api.sh` | rollout timeout 120s → `${ROLLOUT_TIMEOUT:-600s}` |
| `app/app.json` | `expo.android.versionCode` |
| `app/src/app/(app)/(tabs)/settings/devices.tsx` | bottom padding clears the miniplayer |
| `app/package.json` | `yarn iphone` — Release to the named device |

---

## Open, and what to do next

1. **Redeploy 1.5.41** now that the quadratic pass is fixed. `scripts/build-api.sh --deploy`; the
   rollout timeout no longer lies about the outcome.
2. **Then the pairing scenarios**, in milestone 06's order — desktop shows → phone scans; the typed
   code; phone-to-phone; and the offline "Show my code" with the API stopped.
3. **Widen the node selector** from `kubernetes.io/hostname: mini-n` to
   `kubernetes.io/arch: amd64`. The pod is stateless and six healthy nodes qualify. Left as-is
   deliberately this time; the outage is the argument for changing it.
4. **Find out what pinned the CPU** at 13:41 on 2026-09-01. Prometheus knows which pod; this
   document does not.
5. **Android Auto on the DHU** — milestone 05, item 5.
6. The Devices list still shows every device forever: two `iPhone 16 Pro + watch` rows, 4h and 5h
   old, were visible on the device. Milestone 02's open item 6, now with a user-facing surface.

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

- **Actual QR decoding.** The phone cannot be aimed at a screen remotely. The camera streams; that
  a code is read from it is untested.
- **Desktop → phone pairing.** Blocked: production is on 1.5.40, where `/api/pair` 404s. The
  desktop app reports `Could not reach the server to start pairing.`, which is that 404 surfacing
  correctly.
- **Phone → phone pairing.** Should work today — that payload carries the credentials and needs no
  server — but it has not been tried.
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

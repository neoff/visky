# 04 — The macOS desktop player

Full record of the milestone, so the work can be resumed. Started 2026-08-30.

The player existed on Android and iOS only. This milestone puts the same app on a Mac —
installable on a second laptop, built by one command. It started **unsigned** — there was no
paid Apple Developer account — and finished **signed with a Developer ID**, after the account was
bought on 2026-08-31. Both modes still build; unsigned is now a flag, not the only option.

The short version: the phone app's source already had a web target wired up (`react-native-web`,
`react-dom` and `shaka-player` were in `package.json`, the metro web bundler was configured) but
**nobody had ever run it**. It bundled and died on a white screen. Making it run was most of the
work; the Electron shell around it was the smaller half.

---

## Goal

1. **A real .app** the user can carry to another Mac and open.
2. **One command** that builds and rebuilds `.dmg` and `.pkg`.
3. **Reuse the phone source.** No second UI codebase.
4. **Unsigned on purpose** — revised mid-milestone. Once the Apple Developer Program was paid
   for, the goal became a signed build, with `--unsigned` kept as an escape hatch. Notarisation
   is wired but not yet performed; see Part F.

---

## Part A — Why Electron, and what was rejected

Three routes were on the table. The decision was the user's; the evidence below is what it was
made on.

| Route | Verdict |
|---|---|
| **Electron over the Expo web bundle** | Chosen. Reuses every screen. Needs four modules shimmed. Electron can relax CORS for VK's CDN, which a plain browser tab cannot — and that is exactly what HLS needs. Unsigned `.dmg`/`.pkg` is routine. |
| **Mac Catalyst from the iOS target** | Rejected as risk. Native audio and a working WebView for free, but Expo 57 + RNTP under Catalyst means a long fight with pods, and distributing an unsigned Catalyst app is materially worse. |
| **Tauri** | Rejected. ~10 MB instead of ~150, but WKWebView instead of Chromium changes how both the VK captcha and shaka behave, which makes the riskiest part riskier. |

---

## Part B — The web target had never been run

`npx expo export -p web` **succeeded** on the first try: 1641 modules, a 3.2 MB entry bundle and
a 972 KB shaka-player chunk. That last chunk is the tell — `react-native-track-player` ships a
web implementation (`TrackPlayerModule.web.js`) built on shaka, which is why `shaka-player` was
already a dependency.

Bundling is not running. Loading the export in Chrome gave a white screen and one exception:

```
TypeError: e(...).default.resolveAssetSource is not a function
```

Metro will happily bundle a package that requires a native module and let it explode at runtime.
A survey of the dependency tree:

| Module | Web implementation | Used in |
|---|---|---|
| `react-native-fast-image` | none | 6 files |
| `react-native-mmkv-storage` | none | 4 files |
| `@react-native-menu/menu` | none | 1 file |
| `react-native-webview` | none | 1 file (VK login) |
| `react-native-loader-kit` | none | **not used in `src` at all** — free |
| `react-native-image-colors` | has one | free |

**Two separate crashes, both `resolveAssetSource`, and the second one was ours.**

1. `react-native-fast-image` calls `Image.resolveAssetSource`, which react-native-web does not
   implement. The call sits at module scope, so it threw while the module was still being
   evaluated — nothing downstream ever ran.
2. Fixing that revealed the identical call in the app's own `src/constants/images.ts`. Diagnosed
   by reading the failing offset out of the built bundle rather than guessing:

   ```
   const u = e(r(d[1])).default.resolveAssetSource(t.default).uri
   ```

   Replaced by `src/constants/images.web.ts` using `Asset.fromModule` — Expo's own resolver, and
   the supported way to turn a bundled asset into a url on every platform.

After both, the bundle renders and the console is clean.

---

## Part C — The shims

`app/metro.config.js` redirects four module specifiers, **and only for platform `web`**. Native
builds resolve exactly what they resolved before the file existed — this is the property that
makes the whole approach safe to keep.

```js
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = platform === 'web' ? webShims[moduleName] : undefined
  if (shim) return {type: 'sourceFile', filePath: shim}
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform)
}
```

| Shim | Note |
|---|---|
| `fast-image.web.tsx` | Collapses onto RN Web's `Image`. FastImage exists to give Android a disk cache and a priority queue; a browser has both. `priority`/`cache` are stripped before they reach `<img>`. |
| `mmkv.web.ts` | On `localStorage`, because it is the only web store that is **synchronous** — and `store/playback` reads the last session during module evaluation so a cold start can paint the mini player. Implements only the surface actually used. |
| `menu.web.tsx` | UIMenu / PopupMenu redrawn as a centred sheet. `image` names an SF Symbol; there is no web equivalent, so the label carries the meaning alone. |
| `webview.web.tsx` | Electron `<webview>`. See Part D. |

---

## Part D — The Electron shell

`desktop/` — `main.js`, `preload.js`, `webview-preload.js`. Electron 44.0.0,
electron-builder 26.15.3.

**The origin.** The bundle is served over a custom `visky://` scheme registered as `standard`
and `secure`. `secure` is not decoration: it is what grants the renderer `localStorage` (where
the MMKV shim lives) and Media Source Extensions (which shaka needs). Unknown paths fall back to
`index.html`, because expo-router exports one document and routes on the client. The handler has
a containment check so `visky://app/../../etc/passwd` cannot escape the bundle directory.

**CORS.** shaka fetches the HLS manifest and every segment by XHR, and VK's CDN sends no CORS
headers. `onHeadersReceived` adds `Access-Control-Allow-Origin` for a **list** of media hosts,
not `*` — this weakens the same-origin policy, so it is spent only where the audio actually is.
The API host is deliberately absent from that list: `api/src/configurations/router.ts` already
runs `cors({origin: true, credentials: true})`, which reflects any origin and answers preflight
itself, so the `x-auth-*` headers pass without help.

**VK login.** The one caller of `WebView` leans on four behaviours; each maps onto something
Electron has:

| react-native-webview | Electron |
|---|---|
| `injectedJavaScriptBeforeContentLoaded` | the `<webview>` preload, which runs before page scripts |
| `window.ReactNativeWebView.postMessage` | `ipcRenderer.sendToHost`, reshaped back into `{nativeEvent:{data}}` |
| `onNavigationStateChange` | `did-navigate` / `did-navigate-in-page` |
| `onShouldStartLoadWithRequest` | `will-navigate` — **not exact**, see below |

Context isolation stays **on** inside the login webview. Turning it off is the shorter route —
the preload would simply share the page's globals — but it would hand every page VK serves,
captcha widget included, a live `ipcRenderer`, and one of the messages travelling over it is the
grant token. Instead the bridge is one function, and the injected script is placed into the
page's main world with `contextBridge.executeInMainWorld` (Electron ≥ 35; confirmed present in
44 by reading `electron.d.ts`, not from memory).

The injected script is authored in React but must exist before the webview navigates, so the
renderer parks it in the main process and the webview's preload takes it back with a
**synchronous** `sendSync` as its first act.

---

## Part E — One command

```bash
scripts/build-desktop.sh                # dmg + pkg, universal, signed
scripts/build-desktop.sh --dmg          # dmg only, faster
scripts/build-desktop.sh --skip-bundle  # repackage the shell, reuse desktop/web
scripts/build-desktop.sh --run          # launch locally, no packaging
scripts/build-desktop.sh --arch arm64   # or x64, or universal (default)
scripts/build-desktop.sh --unsigned     # skip signing entirely
```

Export → icon → version → package. The icon is rendered from `app/assets/icon.png` (1024²) with
`sips` + `iconutil`, and only when the source is newer. The version is read from `app.json` so
the desktop build never drifts from the phone.

Two settings that are not incidental:

- `EXPO_PUBLIC_DEV=false` is forced. `constants/index.ts` swings `baseHost` to `localhost:3000`
  when it is `"true"`, and a desktop app pointing at a dev server that is not running looks
  exactly like a broken build.
- `CSC_IDENTITY_AUTO_DISCOVERY=false` alongside `"identity": null` — **only under `--unsigned`
  now.** While there was no usable certificate this was unconditional, because otherwise
  electron-builder finds an identity in the keychain and fails halfway on one it cannot use.

---

## Part F — Signing, and a trust setting that broke it

Added 2026-08-31, after the Apple Developer Program was paid for. Team **N853W9Q344**
(Evgeny Nesterov, individual).

Two certificates, both **Developer ID** — the out-of-store kind, not the App Store kind:

| Certificate | Signs | Profile type |
|---|---|---|
| Developer ID Application | the `.app` inside the `.dmg` | G2 Sub-CA |
| Developer ID Installer | the `.pkg` | G2 Sub-CA |

A CSR is half a key pair: the private half stays on this machine, Apple signs only the public
half. Certificate Assistant is the usual way to produce one; the first pair here was generated
with `openssl genrsa` + `openssl req` instead and imported with `security import`, which turned
out to work equally well once the real problem was found — see below.

### The bug worth remembering, second edition

`codesign` refused every Developer ID signature with the same pair of lines:

```
Warning: unable to build chain to self-signed root for signer "Developer ID Application: …"
errSecInternalComponent
```

`errSecInternalComponent` reads like a key-access failure, and that is the wrong tree. What was
ruled out, in order:

| Suspect | Evidence against |
|---|---|
| key does not match the certificate | modulus MD5 identical for both pairs |
| broken chain | leaf AKI `F8:3A:0C:69…` = G2 intermediate SKI, exact match |
| missing root | `Apple Root CA` (SKI `2B:D0:69:47…`) present in the system trust store |
| invalid certificate | `security verify-cert -p codeSign` → successful |
| key ACL / partition list | `set-key-partition-list` applied; no change |
| the sandbox around the build tool | identical failure outside it |
| `codesign` itself | the pre-existing `Apple Development` identity signs fine |
| a platform binary as the target | a freshly compiled binary fails the same way |
| hardened runtime / timestamp server | `--timestamp=none` without `--options runtime` fails too |
| openssl-born key | a **replacement pair generated in Keychain Access failed identically** |

The cause was a **user-domain trust override**. Both `Developer ID Certification Authority`
certificates — G1 and G2 — carried `kSecTrustSettingsResultTrustAsRoot` across ten policies,
Code Signing among them. That marks an *intermediate* as a trust anchor. `codesign` requires a
chain terminating in a **self-signed** root, and an intermediate pinned as a root is not
self-signed, so the chain builder ran out of certificate before it ran out of requirement. The
warning says exactly that; it just does not sound like a configuration problem.

```bash
security dump-trust-settings          # the user domain — where the override lived
security remove-trusted-cert <cert>   # the whole fix
```

Signing worked immediately afterwards, **including with the original openssl-born key**. The
replacement certificates were unnecessary. They were kept because the keychain is a tidier place
for a key than a file in `~/apple-signing`.

Worth carrying forward: `security find-certificate -c "Apple Root CA"` matches on **substring**
and returns `Apple Root CA - G3` first. Two test keychains were built around the wrong root
before that was noticed. Select roots by SKI, not by name.

### Duplicate identities

With both pairs installed, the keychain held two certificates per kind with byte-identical
common names, and the build died on:

```
Developer ID Application: Evgeny Nesterov (N853W9Q344): ambiguous
```

Pinning `mac.identity` to a SHA-1 hash does **not** avoid this: electron-builder resolves the
hash back to a display name and hands `codesign` the name. The superseded pair was deleted
(`security delete-identity -Z <hash>`); the hashes stay pinned in `package.json` anyway, so a
future duplicate fails loudly at lookup rather than silently picking the other one.

### Hardened runtime

Notarisation requires the hardened runtime, and the hardened runtime blocks precisely what a JS
engine does. `desktop/build/entitlements.mac.plist` carries four exceptions:

| Entitlement | Without it |
|---|---|
| `cs.allow-jit` | V8 cannot map memory writable-then-executable |
| `cs.allow-unsigned-executable-memory` | V8 also writes into pages never marked executable up front |
| `cs.disable-library-validation` | the helpers load frameworks signed by Electron, not by us |
| `cs.allow-dyld-environment-variables` | the launcher passes `DYLD_*` to helper processes |

All four kill the app at launch rather than producing a readable error, which is the same failure
class as the preload bug above: **silent, and invisible from the outside.**

### What the script does now

Signing is the default. `--unsigned` restores the old behaviour. Identities are checked against
the keychain *before* the build starts, rather than twenty minutes into a universal one.
Notarisation switches itself on only when credentials are in the environment — an App Store
Connect API key (`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`) or an Apple ID with
an app-specific password — and is skipped with a warning otherwise.

### Verified

`scripts/build-desktop.sh --dmg --arch arm64 --skip-bundle` → `visky-1.0.0-arm64.dmg` (128 MB).

```
Identifier=com.envarg.visky.desktop
CodeDirectory v=20500 flags=0x10000(runtime)
Authority=Developer ID Application: Evgeny Nesterov (N853W9Q344)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=N853W9Q344
```

`codesign --verify --deep --strict` passes. `spctl -a -t exec` **rejects**, with
`source=Unnotarized Developer ID` — the signature is accepted, the notarisation is what is
missing.

### Still open on signing

- **Notarisation has never run.** It needs an App Store Connect API key (Users and Access →
  Integrations), which does not exist yet. The `.p8` obtained this session is an **APNs** key —
  a different key for a different purpose, not interchangeable.
- Until then a transferred build is still quarantined and still needs
  `xattr -dr com.apple.quarantine /Applications/visky.app` once on the receiving Mac.
- The Mac App Store remains rejected, now for a second reason beyond the ones in Part A: MAS
  requires App Sandbox, and an Electron shell with a `<webview>` and per-host CORS injection is a
  poor fit for it.

---

## The bug worth remembering

**A sandboxed Electron preload may only require `electron`, `events`, `timers` and `url`.**

The first packaged build launched and drew the welcome screen. It looked like success. The log
said otherwise:

```
Unable to load preload script: .../app.asar/preload.js
Error: module not found: path
```

`require('path')` aborts the **whole** preload, so `window.viskyDesktop` silently never appeared
and VK login had no bridge at all. It was invisible from outside because the welcome screen does
not need the bridge — the failure would only have surfaced on the login screen, on the other
laptop, with no console.

Fixed by computing the path in the main process and fetching it over IPC. The sandbox stays on.
Verified rather than assumed:

```
BRIDGE-CHECK {"bridge":"object","preload":"file:///…/webview-preload.js","platform":"macos"}
```

The general lesson matches milestone 03's: **an app that renders is not an app that works.**
Both bugs this milestone were silent — a module-scope throw and a preload that fails whole.

---

## Verified

- `expo export -p web` produces a 3.1 MB entry bundle + 972 KB shaka chunk, 1641 modules
- served locally and loaded in Chrome: welcome screen renders, **zero console errors** on the
  current bundle (the first read showed errors carrying the *previous* bundle hash — stale
  buffer, not a live failure)
- `scripts/build-desktop.sh` end to end produces
  `visky-1.0.0-universal.dmg` (223 MB) and `visky-1.0.0-universal.pkg` (221 MB)
- the packaged `.app` launches, serves itself over `visky://`, redirects to `(auth)/welcome`,
  and shows a native menu bar and traffic lights
- repackaged after the preload fix: **0 preload errors, 0 renderer errors**, process alive
- the `viskyDesktop` bridge is present in the renderer with the sandbox on (output above)

## Not done

- **Audio has never played.** The largest open risk. RNTP-web → shaka → signed VK HLS through
  the CORS injection is written but untested; it needs a logged-in session, and a live VK login
  is what tripped flood control before. Unknowns: shaka's handling of AES-128 HLS, and whether
  `CORS_HOSTS` in `desktop/main.js` covers the hosts VK actually serves from.
- **VK login in the webview is untested** against live VK, for the same reason.
- `onShouldStartLoadWithRequest` is an approximation: `<webview>`'s `will-navigate` cannot be
  cancelled from the host, so a refusal is enforced with `stop()` and the refused page can flash
  for a frame.
- ~~**Pairing with the phone is not started.**~~ **Done in milestone 06** — the endpoint predicted
  here exists (`POST /api/pair` issues a code, `GET /api/pair/:id` exchanges it for a session).
  One correction to the plan above: the code is shown by the screen that *wants* a session, not
  by the phone, which is why it needed a server rendezvous at all. See
  `docs/06-pairing-milestone.md`. **Not yet deployed or run live.**
- `localStorage` caps around 5 MB per origin while the Songs tab caches whole pages of tracks.
  An overflowing write is caught and logged, so the app degrades to "no cache", not to a white
  screen — but it is a cap the phone does not have.
- Hardware media keys are not wired.

---

## Shipped alongside — not part of this milestone

Two playback fixes landed in the same session and belong on the record.

**Part ordering.** `sortLocalPartTracks` grouped by base title alone. FRISKY titles are *slot*
names, not show names — "Artist of the Week" returns weekly with a different artist — so two
shows collapsed into one group and came out interleaved: Part 1, Part 1, Part 2, Part 2. The key
is now artist + base title + a 24-hour window on the upload date. The window is needed
independently: the search route sorts the whole catalogue at once, where one artist hosts the
same slot again months later. Three tests cover the reported case, the repeat-edition case, and
that two halves uploaded minutes apart still meet. 128 API tests pass.

**Gapless hand-over.** `services/prefetch.ts` warms the next track 90 s before the current ends,
driven by `Event.PlaybackProgressUpdated` from the *playback service* — not a hook, because the
service survives the screen going off and an hour-long mix is heard with the phone in a pocket.
It re-resolves the signed VK link if it has aged out (the queue is filled once, so by the end of
a one-hour Part 1 the link for Part 2 is an hour old) and warms the CDN with ranged reads of the
first two segments rather than whole ones.

One hypothesis was **disproved** on the way and is recorded so it is not re-investigated:
`Bundle.getDouble` returns `0.0` for an absent key, which looked like it would zero out RNTP's
buffer config. Decompiling kotlin-audio's `setupBuffer` shows `ifeq → 50000` — zero falls back
to the default. The buffers were always 50 s / 50 s / 2.5 s. The gap is not that.

---

## Shipped alongside — the store deployment path

Not desktop work, but it came out of the same Apple account and the same session, and the
`eas.json` finding below was a live defect.

**A store build would not have been a store build.** `production` extends `base`, and `base`
carries `ios.simulator: true` for local testing. EAS deep-merges an extended profile, so
`--profile production` would have produced a **simulator** `.app` — an artifact App Store Connect
rejects outright. Now overridden explicitly:

```json
"production": {"extends": "base", "distribution": "store", "ios": {"simulator": false}}
```

Other changes:

- `submit.production.ios.appleId` — set to the actual Apple ID, `en.varg@me.com`.
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, so export compliance is not asked on
  every upload.
- `scripts/deploy-ios.sh` — cloud build + auto-submit to App Store Connect, `--no-submit`,
  `--submit-last`, `PROFILE` override. Promoting a TestFlight build to a public release stays a
  manual click; a script should not be able to trigger a release by accident.

**The watch target costs a second App ID.** `plugins/withWatchApp.js` derives
`${ios.bundleIdentifier}.watchkitapp`, and Apple requires the watch App ID to be a strict prefix
extension of the phone's. Both are registered explicitly. `--non-interactive` cannot create the
second provisioning profile, so the **first** store build has to run interactively; after that
EAS holds both profiles and the script runs unattended.

The bundle identifier moved to `com.envarg.frisky` for an hour, because `com.envarg.visky` looked
taken, and moved back once the Identifiers were recreated. Three files carry it and all three
must agree: `app.json`, `watch/Info.plist` (`WKCompanionAppBundleIdentifier`, rewritten at
prebuild from the config) and the plugin's fallback. Verified through the generated project:

```
PRODUCT_BUNDLE_IDENTIFIER = "com.envarg.visky"
PRODUCT_BUNDLE_IDENTIFIER = "com.envarg.visky.watchkitapp"
```

Android's `package` stays `com.envarg.visky` regardless — the app is live on Google Play under
it, and renaming breaks updates.

**MusicKit and ShazamKit** are enabled on the App ID for future set-tracklist recognition. No
entitlements were added, deliberately: an entitlement without the matching capability fails the
build, a capability without the entitlement is inert. When they are actually used, the
entitlements go into `app.json` → `ios.entitlements` **and the provisioning profiles must be
regenerated** — changing capabilities invalidates the existing ones.

**Secrets.** `certs/AuthKey_*.p8` was sitting in the repository untracked but not ignored.
`certs/`, `*.p8`, `*.p12`, `*.mobileprovision` and `*.certSigningRequest` are now in
`.gitignore`; `git log --all --diff-filter=A` over those paths confirms nothing was ever
committed.

**Left interactive**, because each needs an Apple login with 2FA: creating the App Store Connect
record, `eas credentials -p ios` (distribution certificate, both provisioning profiles, APNs key
upload), and the first store build.

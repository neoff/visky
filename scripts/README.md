# scripts/

Build, release and deploy scripts for the monorepo. Run them from the repo root
(they resolve their own paths, so `scripts/build-api.sh` works from anywhere).
Make sure they're executable: `chmod +x scripts/*.sh`.

Releases are run through subagents on Haiku 4.5, one per pipeline, so the main
session does not fill up with spinner frames and build logs — and so the four
pipelines run at once. What an agent may and may not decide is in
[docs/deploy-process.md](../docs/deploy-process.md).

## App (React Native / Expo, package `com.envarg.visky`)

### `build-app.sh` — Android → Google Play, in the cloud or on this machine
One script, two places the build can happen. `--local` is the whole difference.

```bash
scripts/build-app.sh                    # cloud build + submit
scripts/build-app.sh --local            # build here + submit
scripts/build-app.sh --no-submit        # build only
scripts/build-app.sh --local --no-submit
PROFILE=preview scripts/build-app.sh    # a different eas.json profile
```

|            | cloud (default)            | `--local`                       |
|------------|----------------------------|---------------------------------|
| builds     | **the last commit**        | **the working tree**            |
| artifact   | hosted on expo.dev         | `app/build/*.aab`, stays here   |
| submits    | from expo.dev              | straight from disk              |
| git guard  | clean tree required        | none                            |

The guard asymmetry is deliberate, not an oversight. A cloud build uploads the
commit, so an uncommitted change is silently missing from it — including the
version — and that is worth stopping for. A local build compiles the tree in
front of you, so dirty is simply what you asked for. The version check runs
either way, because the artifact carries the number either way.

Needs: `eas whoami` authenticated and the Google Service Account Key on EAS
(already set — `eas-submit@visky-464014`). `--local` also needs the Android SDK
and **JDK 17** here; anything newer breaks CMake.

### Off EAS entirely — `deploy-ios-local.sh`, `build-app-local.sh`
Same two destinations, no expo.dev in the path at all. `build-app.sh --local`
still signs in to EAS and takes its credentials from there; these do not.

```bash
scripts/deploy-ios-local.sh              # xcodebuild archive -> altool upload
scripts/deploy-ios-local.sh --no-upload  # keep the .ipa, upload nothing
scripts/build-app-local.sh               # gradlew bundleRelease -> Play internal
scripts/build-app-local.sh --track alpha
```

Everything EAS was doing implicitly becomes explicit:

* **`expo prebuild` runs first.** `app/ios` and `app/android` are gitignored and
  generated, so skipping it silently builds a stale project. `--no-prebuild`
  reuses what is there when you know it is current.
* **The build number comes from the store**, not from a file —
  `scripts/lib/next-build-number.js` asks App Store Connect or Play for the
  highest one and adds one. A counter in git drifts the moment two machines,
  a rebase, or a failed-after-bump build are involved, and both stores reject a
  duplicate at the *end* of a long upload. The store enforces the rule, so the
  store is asked.
* **Provisioning profiles are found by bundle id**, not by name: EAS names them
  with a timestamp that changes every regeneration.
* **Signing material** comes from `~/apple-signing` — the distribution
  certificate in the login keychain for iOS, the keystore and its passwords for
  Android. Passwords go straight into Gradle's arguments and are never written
  into the project, which `prebuild` would wipe anyway.

`scripts/lib/play-upload.js` talks to the Play Developer API with a
service-account JWT and no SDK. Play uses an edit model — open, upload, assign a
track, commit — so a failure part-way leaves the listing untouched; the script
abandons the edit rather than leaving a stale one behind.

Neither script submits for review. That stays deliberate and separate.

### `deploy-ios.sh` — cloud build (expo.dev) + App Store Connect / TestFlight
EAS **cloud** build of the iOS app, auto-submitted to App Store Connect. The
build shows up in TestFlight; promoting it to a public App Store release stays a
manual step in App Store Connect.

```bash
scripts/deploy-ios.sh               # production build + submit
scripts/deploy-ios.sh --no-submit   # build only (stays on expo.dev)
scripts/deploy-ios.sh --submit-last # submit the latest EAS build, no rebuild
PROFILE=preview scripts/deploy-ios.sh
```

Needs: paid **Apple Developer Program** membership, `eas whoami` authenticated,
a clean git tree, and the App Store Connect API key at
`~/apple-signing/AuthKey_PNX776L4UV.p8` (override with `ASC_KEY_PATH`). The app
record already exists — `ascAppId` `6808513521` in `eas.json`.

**No interactive Apple login.** The script authenticates with the App Store
Connect API key, so it runs unattended: no 2FA prompt, no Apple ID password, no
cookie session that expires after a few days. Two things about that key are
worth knowing before it goes missing:

* Apple hands the `.p8` over **once**, at creation. Lost means revoke and
  regenerate, not re-download.
* It is a **Team** key with the **App Manager** role. Developer would have been
  enough to notarise the desktop build but not to upload to App Store Connect,
  and a key's role cannot be widened after it is created.

`EXPO_APPLE_TEAM_TYPE` is not optional. Without it eas-cli never reaches
authentication and reports the app as missing from App Store Connect — an error
that points nowhere near the cause.

Signing material lives on EAS: one distribution certificate and **two**
provisioning profiles, because the watch app is a separate bundle id
(`com.envarg.visky.watchkitapp`). `eas credentials:configure-build -p ios`
created them; it only has to run again when they expire (2027-09-04).

eas-cli does not find the watch target by reading the Xcode project. For a CNG
project it takes the target list **only** from
`extra.eas.build.experimental.ios.appExtensions` in `app.json`. Remove that
entry and the watch target silently goes unsigned.

The script sets `EXPO_NO_CAPABILITY_SYNC=1`. Without it eas-cli tries to mirror
`app.json` entitlements onto the Apple App IDs before each build, and Apple
rejects the request for the watch App ID, which carries the deprecated
`CARPLAY_PLAYABLE_CONTENT` capability. The trade: the Apple developer portal
becomes the source of truth for capabilities — change them there, not in
`app.json`.

## Desktop (Tauri, macOS)

### `build-desktop.sh` — signed .dmg / .pkg
Exports the Expo web bundle, compiles it into the Tauri shell and packages a universal
build, **signed** with the Developer ID certificates in the login keychain (pinned by
SHA-1 at the top of the script — two of each certificate live there, so the name alone
is ambiguous).

The Electron shell it replaced still builds — `scripts/build-desktop-electron.sh`,
sources in `desktop-electron/` — but Tauri is what ships: ~16 MB against ~296 MB.

```bash
scripts/build-desktop.sh              # dmg + pkg, signed
scripts/build-desktop.sh --dmg        # dmg only
scripts/build-desktop.sh --arch arm64
scripts/build-desktop.sh --skip-bundle
scripts/build-desktop.sh --unsigned   # skip signing
scripts/build-desktop.sh --run        # launch locally, no packaging
```

Notarisation runs only when Apple credentials are in the environment — either
`APPLE_API_KEY` (path to the .p8) + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` for an
App Store Connect API key, or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`. Without them
the build is signed but not notarised, and the receiving Mac still needs, once:
`xattr -dr com.apple.quarantine /Applications/visky.app`.

The `.app`, the `.dmg` and the `.pkg` are each submitted and stapled separately, and
the script does this itself rather than letting Tauri do it. Tauri notarises only the
bundles it produces, and it has no `.pkg` bundler — the installer would have shipped
signed but unnotarised, which Gatekeeper blocks exactly as hard as unsigned. Expect
three round trips to Apple, a few minutes each.

## API (Node/Express, image `varg/visky-api`)

### `build-api.sh` — build + push Docker image (+ optional deploy)
Bumps the patch version in `api/package.json`, builds `linux/amd64`, pushes
`:<version>` and `:latest` to Docker Hub. With `--deploy` it rolls the image out
to Kubernetes afterwards (calls `deploy-api.sh`).

```bash
scripts/build-api.sh            # bump patch, build + push
scripts/build-api.sh --deploy   # bump patch, build + push, then deploy to k8s
scripts/build-api.sh --no-bump  # reuse the current version
BUMP=minor scripts/build-api.sh # bump minor (or major) instead of patch
```

Needs: Docker running, `docker buildx`, Docker Hub push auth.

### `deploy-api.sh` — deploy an image tag to Kubernetes (deploy-only)
Sets the deployment image and waits for the rollout. Use after `build-api.sh`,
or use `build-api.sh --deploy` to do both in one go.

```bash
scripts/deploy-api.sh          # deploy the current api/package.json version
scripts/deploy-api.sh 1.5.23   # deploy a specific tag
scripts/deploy-api.sh latest   # deploy :latest
```

Target defaults (override via env): `KCTX=oracle NS=frisky DEPLOY=visky-api
CONTAINER=visky-api IMAGE=varg/visky-api`.

## Versioning — one number, and it comes from the API

`api/package.json` is the single source. Every frontend — phone app, desktop
shell, Electron fallback, web image — carries the **API's** version, not one of
its own.

```bash
scripts/sync-version.sh           # write the api version into every target
scripts/sync-version.sh --check   # report drift, write nothing, exit 1 if any
```

The point is not to describe the frontend, it is to record the backend the
frontend was built against. A desktop build that goes `1.5.40 -> 1.5.48` with no
desktop commits in between is the intended reading: same app, newer backend
contract. Conversely a frontend version never answers "did the frontend change" —
use git for that.

`build-api.sh` runs the sync right after it bumps, so the bump is not finished
until the frontends carry it. `build-desktop*.sh` and `build-web.sh` run it and
then read the number back, so a local build cannot package a stale one.

`build-app.sh` and `deploy-ios.sh` run `--check` instead, and refuse to build on
drift. A cloud build goes through EAS, which packages the **last commit** —
syncing the working tree at that point would change nothing about what actually
gets built, so stopping is the only honest option. Sync, commit, re-run.
(`build-app.sh --local` does compile the working tree, but it still refuses on
drift: a stale version in the artifact is wrong wherever it was produced.)

The write is a text replacement pinned to the version key, not a JSON
round-trip: `desktop-electron/package.json` keeps its em dash and © as `\u2014`
and `\u00a9` escapes, and `JSON.stringify` silently unescapes them. It also
refuses to touch a file where the key is not unique.

### `version.sh` — semver helper
Sourced utility. `get_next_version [major|minor|patch]` prints the next version
from the `package.json` in the current directory. `build-api.sh` uses
`npm version` directly, so this is here for ad-hoc use.

## Typical release flows

```bash
# API: ship a new version to production. Bumps api/package.json AND writes that
# version into every frontend, so commit afterwards even if you touched nothing
# else — that is what pins the next app release to this backend.
scripts/build-api.sh --deploy
git commit -am "chore: version -> $(node -p "require('./api/package.json').version")"

# App: ship a new version to Google Play
git commit -am "…"          # EAS builds the last commit
scripts/build-app.sh
```

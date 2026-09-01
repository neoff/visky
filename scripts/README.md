# scripts/

Build, release and deploy scripts for the monorepo. Run them from the repo root
(they resolve their own paths, so `scripts/build-api.sh` works from anywhere).
Make sure they're executable: `chmod +x scripts/*.sh`.

## App (React Native / Expo, package `com.envarg.visky`)

### `build-app.sh` — cloud build (expo.dev) + Google Play
EAS **cloud** build of the Android app. The artifact is hosted on **expo.dev**
and, by default, **auto-submitted to Google Play** (internal track).

```bash
scripts/build-app.sh                # production build, auto-submit to Google Play
scripts/build-app.sh --no-submit    # build only (still hosted on expo.dev)
PROFILE=preview scripts/build-app.sh # use a different eas.json profile
```

Needs: `eas whoami` authenticated, a **clean git tree** (EAS builds the last
commit), Google Service Account Key configured on EAS (already set).

### `build-app-local.sh` — clean local build → Google Play only (no expo.dev)
Compiles the `.aab` **locally** (not hosted on expo.dev) and submits it straight
to Google Play (internal track).

```bash
scripts/build-app-local.sh              # local build + submit to Google Play
scripts/build-app-local.sh --no-submit  # local build only, keeps app/build/*.aab
```

Needs: local **Android SDK + JDK 17**, `eas` auth (for `eas submit`), clean git
tree. Slower to set up than the cloud build; use it to keep the build off expo.dev.

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

Needs: paid **Apple Developer Program** membership, the app record created in
App Store Connect for `com.envarg.visky`, `eas whoami` authenticated, clean git
tree. Signing material lives on EAS — run `eas credentials -p ios` once.

The watch target ships a second bundle id (`com.envarg.visky.watchkitapp`) that
needs its own provisioning profile, so the **first** store build must run
interactively (`npx eas-cli@latest build -p ios --profile production`) to let
EAS create it. Later runs of the script work unattended.

## Desktop (Electron, macOS)

### `build-desktop.sh` — signed .dmg / .pkg
Exports the Expo web bundle, wraps it in the Electron shell and packages a universal build,
**signed** with the Developer ID certificates in the login keychain (pinned by SHA-1 in
`desktop/package.json`).

```bash
scripts/build-desktop.sh              # dmg + pkg, signed
scripts/build-desktop.sh --dmg        # dmg only
scripts/build-desktop.sh --arch arm64
scripts/build-desktop.sh --skip-bundle
scripts/build-desktop.sh --unsigned   # skip signing
scripts/build-desktop.sh --run        # launch locally, no packaging
```

Notarisation runs only when Apple credentials are in the environment — either
`APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` (App Store Connect API key)
or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`. Without them the build is signed but
not notarised, and the receiving Mac still needs, once:
`xattr -dr com.apple.quarantine /Applications/visky.app`.

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

## `version.sh` — semver helper
Sourced utility. `get_next_version [major|minor|patch]` prints the next version
from the `package.json` in the current directory (the build scripts use
`npm version` directly; this is here for ad-hoc use).

## Typical release flows

```bash
# API: ship a new version to production
scripts/build-api.sh --deploy

# App: ship a new version to Google Play
git commit -am "…"          # EAS builds the last commit
scripts/build-app.sh
```

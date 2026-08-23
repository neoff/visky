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

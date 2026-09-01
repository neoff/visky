#!/usr/bin/env bash
# Build the WEB PLAYER: the Expo bundle exported for platform `web` under the
# /player sub-path, packed into an nginx image and pushed to Docker Hub.
#
#   scripts/build-web.sh                  # export + build + push
#   scripts/build-web.sh --deploy         # ...and roll it out
#   scripts/build-web.sh --skip-bundle    # reuse web/web, repackage only
#   scripts/build-web.sh --local          # build the image, do not push
#   scripts/build-web.sh --serve          # export and serve it locally on :8081
#
# The web player CANNOT log in — VK challenges the password grant from anything
# that is not a phone — so it is handed a session from the phone over QR or a
# copied link. Nothing here needs VK credentials at build time.
#
# Env:
#   IMAGE          default varg/visky-web
#   API_URL        default https://frisky.envarg.com   (the backend origin)
#   PUBLIC_URL     default $API_URL/player             (where this bundle lives)
#   BASE_PATH      default /player                     (must match the ingress)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
WEB_DIR="$ROOT/web"
OUT="$WEB_DIR/web"

IMAGE="${IMAGE:-varg/visky-web}"
API_URL="${API_URL:-https://frisky.envarg.com}"
BASE_PATH="${BASE_PATH:-/player}"
PUBLIC_URL="${PUBLIC_URL:-$API_URL$BASE_PATH}"

SKIP_BUNDLE=0
PUSH=1
DO_DEPLOY=0
SERVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-bundle) SKIP_BUNDLE=1 ;;
    --local)       PUSH=0 ;;
    --deploy)      DO_DEPLOY=1 ;;
    --serve)       SERVE=1 ;;
    -h|--help)     sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# 1. The bundle
# ---------------------------------------------------------------------------
if [ "$SKIP_BUNDLE" -eq 0 ]; then
  echo "==> exporting the Expo bundle for web  (base=$BASE_PATH api=$API_URL)"
  rm -rf "$OUT"
  cd "$APP_DIR"
  # EXPO_WEB_BASE_URL feeds app.config.js -> experiments.baseUrl, which is what
  # rewrites every asset path to /player/_expo/... Without it the page loads
  # from the API container and shows a white screen.
  #
  # EXPO_PUBLIC_DEV=false is not optional either: constants/index.ts points
  # baseHost at localhost:3000 when it is "true".
  EXPO_WEB_BASE_URL="$BASE_PATH" \
  EXPO_PUBLIC_DEV=false \
  EXPO_PUBLIC_API_URL="$API_URL" \
  EXPO_PUBLIC_WEB_URL="$PUBLIC_URL" \
    npx expo export -p web --output-dir "$OUT"
else
  echo "==> reusing the bundle already in web/web"
  [ -f "$OUT/index.html" ] || { echo "no bundle there yet — run without --skip-bundle" >&2; exit 1; }
fi

if [ "$SERVE" -eq 1 ]; then
  # Served one level up so the paths match production: http://localhost:8081/player/
  echo "==> serving $WEB_DIR on http://localhost:8081/player/  (ctrl-c to stop)"
  cd "$WEB_DIR"
  exec npx --yes serve -l 8081 .
fi

# ---------------------------------------------------------------------------
# 2. Version, kept in step with the phone app
# ---------------------------------------------------------------------------
VERSION="$(node -p "require('$APP_DIR/app.json').expo.version")"
echo "==> version $VERSION"

# ---------------------------------------------------------------------------
# 3. The image
# ---------------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "!! docker isn't running — start Docker and retry." >&2
  exit 1
fi

cd "$WEB_DIR"
if [ "$PUSH" -eq 1 ]; then
  echo "==> docker buildx build + push $IMAGE:$VERSION (+ :latest), linux/amd64"
  docker buildx build --platform linux/amd64 \
    -t "$IMAGE:$VERSION" \
    -t "$IMAGE:latest" \
    --push .
else
  echo "==> docker build $IMAGE:$VERSION (local only)"
  docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .
  echo "    try it:  docker run --rm -p 8080:8080 $IMAGE:$VERSION"
  echo "    then:    open http://localhost:8080/player/"
fi

if [ "$DO_DEPLOY" -eq 1 ]; then
  "$ROOT/scripts/deploy-web.sh" "$VERSION"
else
  echo "==> not deployed. Run: scripts/deploy-web.sh $VERSION"
fi

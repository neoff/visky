#!/usr/bin/env bash
# Build the api Docker image (linux/amd64) and push it to Docker Hub. Bumps the
# patch version in api/package.json first. With --deploy it also rolls the new
# image out to Kubernetes (via deploy-api.sh) after the push.
#
# Usage:
#   scripts/build-api.sh                 # bump patch, build + push
#   scripts/build-api.sh --deploy        # bump patch, build + push, then k8s deploy
#   scripts/build-api.sh --no-bump       # reuse current package.json version
#   BUMP=minor scripts/build-api.sh      # bump minor/major instead of patch
#
# Env: IMAGE (default varg/visky-api). Deploy target vars are read by deploy-api.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/api"
IMAGE="${IMAGE:-varg/visky-api}"
BUMP="${BUMP:-patch}"
DO_DEPLOY=0
DO_BUMP=1

for arg in "$@"; do
  case "$arg" in
    --deploy)  DO_DEPLOY=1 ;;
    --no-bump) DO_BUMP=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "!! docker isn't running — start Docker and retry." >&2
  exit 1
fi

cd "$API_DIR"

if [ "$DO_BUMP" -eq 1 ]; then
  VER="$(npm version "$BUMP" --no-git-tag-version | tr -d 'v')"
  echo "==> bumped version -> $VER"
else
  VER="$(node -pe 'require("./package.json").version')"
  echo "==> reusing version $VER"
fi

echo "==> docker buildx build + push $IMAGE:$VER (+ :latest), linux/amd64"
docker buildx build --platform linux/amd64 \
  -t "$IMAGE:$VER" \
  -t "$IMAGE:latest" \
  --push .

echo "==> pushed $IMAGE:$VER"

if [ "$DO_DEPLOY" -eq 1 ]; then
  echo "==> deploying $VER to Kubernetes"
  "$ROOT/scripts/deploy-api.sh" "$VER"
else
  echo "==> not deployed. Run: scripts/deploy-api.sh $VER"
fi

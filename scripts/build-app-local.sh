#!/usr/bin/env bash
# CLEAN build: compile the Android app LOCALLY (no expo.dev cloud build, artifact
# is NOT hosted on expo.dev) and submit that .aab straight to Google Play
# (internal track).
#
# Use this when you want the artifact built on your machine and only Google Play
# to receive it. Slower to set up (needs the local Android toolchain) but keeps
# the build off expo.dev.
#
# Usage:
#   scripts/build-app-local.sh              # local build + submit to Google Play
#   scripts/build-app-local.sh --no-submit  # local build only, leaves the .aab
#
# Requires: Android SDK + JDK 17 locally, eas-cli auth, clean git tree, and the
# Google Service Account Key on EAS (used by `eas submit`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PROFILE="${PROFILE:-production}"
SUBMIT=1

for arg in "$@"; do
  case "$arg" in
    --no-submit) SUBMIT=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"
mkdir -p build
OUT="build/visky-$(date +%Y%m%d-%H%M%S).aab"

echo "==> eas whoami"
npx eas-cli@latest whoami

echo "==> LOCAL EAS build (profile=$PROFILE) -> $OUT  (not hosted on expo.dev)"
npx eas-cli@latest build \
  --platform android \
  --profile "$PROFILE" \
  --local \
  --non-interactive \
  --output "$OUT"

if [ "$SUBMIT" -eq 1 ]; then
  echo "==> Submit $OUT to Google Play (internal)"
  npx eas-cli@latest submit \
    --platform android \
    --profile "$PROFILE" \
    --path "$OUT" \
    --non-interactive
  echo "==> done. Submitted to Google Play. Artifact stayed local: $APP_DIR/$OUT"
else
  echo "==> done. Local artifact: $APP_DIR/$OUT (not submitted, not on expo.dev)"
fi

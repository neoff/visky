#!/usr/bin/env bash
# Build the Android app on EAS (hosted on expo.dev) and auto-submit to Google
# Play (internal track). The build artifact (.aab) is stored on expo.dev AND the
# release is pushed to Google Play in one step.
#
# Usage:
#   scripts/build-app.sh                 # production profile, auto-submit
#   scripts/build-app.sh --no-submit     # build only (still hosted on expo.dev)
#   PROFILE=preview scripts/build-app.sh  # different eas.json build profile
#
# Requires: eas-cli auth (`eas whoami`), a clean git tree (EAS uses the commit),
# and the Google Service Account Key already configured on EAS (it is).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PROFILE="${PROFILE:-production}"
SUBMIT="--auto-submit"

for arg in "$@"; do
  case "$arg" in
    --no-submit) SUBMIT="" ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

echo "==> eas whoami"
npx eas-cli@latest whoami

if [ -n "$(git status --porcelain)" ]; then
  echo "!! git tree is dirty — EAS builds the last commit. Commit first." >&2
  exit 1
fi

echo "==> EAS build (profile=$PROFILE) ${SUBMIT:+with auto-submit to Google Play}"
npx eas-cli@latest build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive \
  $SUBMIT

echo "==> done. Build hosted on expo.dev${SUBMIT:+ and submitted to Google Play (internal)}."

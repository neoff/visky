#!/usr/bin/env bash
# Build the Android app and submit it to Google Play (internal track).
#
# TWO PLACES THE BUILD CAN HAPPEN, and the difference is not only where the
# machine is:
#
#   cloud (default)  EAS builds THE LAST COMMIT, uploaded from git. The artifact
#                    is hosted on expo.dev and submitted from there.
#   --local          EAS builds THE WORKING TREE on this machine. Nothing is
#                    uploaded to expo.dev; the .aab lands in app/build/ and is
#                    submitted straight from disk.
#
# That is why the git checks below apply to the cloud build only. A dirty tree
# makes a cloud build ship something other than what you are looking at — the
# whole point of the guard — while a local build ships exactly what you are
# looking at, dirty or not.
#
# Usage:
#   scripts/build-app.sh                    # cloud build + submit
#   scripts/build-app.sh --local            # build here + submit
#   scripts/build-app.sh --no-submit        # build only
#   scripts/build-app.sh --local --no-submit
#   PROFILE=preview scripts/build-app.sh    # a different eas.json profile
#
# Requires: eas-cli auth (`eas whoami`), and the Google Service Account Key
# already configured on EAS (it is — eas-submit@visky-464014). A --local build
# additionally needs the Android SDK and JDK 17 on this machine; anything newer
# breaks CMake, see docs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PROFILE="${PROFILE:-production}"
SUBMIT=1
LOCAL=0

for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=1 ;;
    --no-submit) SUBMIT=0 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

echo "==> eas whoami"
npx eas-cli@latest whoami

# The version has to be in step wherever the build happens: the artifact carries
# it either way.
"$ROOT/scripts/sync-version.sh" --check

if [ "$LOCAL" -eq 0 ]; then
  # Cloud only. EAS uploads the last commit, so an uncommitted change would be
  # silently absent from the build — including the version just checked above.
  if [ -n "$(git status --porcelain)" ]; then
    echo "!! git tree is dirty — EAS builds the last commit. Commit first," >&2
    echo "   or build from this tree with --local." >&2
    exit 1
  fi
fi

if [ "$LOCAL" -eq 1 ]; then
  mkdir -p build
  OUT="build/visky-$(date +%Y%m%d-%H%M%S).aab"
  echo "==> LOCAL build (profile=$PROFILE) -> $OUT  (not hosted on expo.dev)"
  npx eas-cli@latest build \
    --platform android \
    --profile "$PROFILE" \
    --local \
    --non-interactive \
    --output "$OUT"

  if [ "$SUBMIT" -eq 1 ]; then
    echo "==> submitting $OUT to Google Play (internal)"
    npx eas-cli@latest submit \
      --platform android \
      --profile "$PROFILE" \
      --path "$OUT" \
      --non-interactive
    echo
    echo "==> done. Submitted to Google Play. The artifact stayed on this machine:"
    echo "    $APP_DIR/$OUT"
  else
    echo
    echo "==> done. Local artifact, not submitted, not on expo.dev:"
    echo "    $APP_DIR/$OUT"
  fi
else
  echo "==> EAS cloud build (profile=$PROFILE)${SUBMIT:+ with auto-submit to Google Play}"
  npx eas-cli@latest build \
    --platform android \
    --profile "$PROFILE" \
    --non-interactive \
    ${SUBMIT:+--auto-submit}

  echo
  echo "==> done. Build hosted on expo.dev${SUBMIT:+ and submitted to Google Play (internal)}."
fi

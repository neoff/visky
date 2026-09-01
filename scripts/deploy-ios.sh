#!/usr/bin/env bash
# Build the iOS app on EAS (hosted on expo.dev) and submit it to App Store
# Connect, where it lands in TestFlight. Promoting that build to a public App
# Store release stays a manual click in App Store Connect — on purpose, a
# release is not something a script should trigger by accident.
#
# Usage:
#   scripts/deploy-ios.sh                  # production build + submit to App Store Connect
#   scripts/deploy-ios.sh --no-submit      # build only (artifact stays on expo.dev)
#   scripts/deploy-ios.sh --submit-last    # skip the build, submit the latest EAS build
#   PROFILE=preview scripts/deploy-ios.sh  # different eas.json build profile
#
# Requires:
#   * eas-cli auth (`eas whoami`) — checked below
#   * a paid Apple Developer Program membership on the Apple ID in eas.json
#   * the app record already created in App Store Connect for com.envarg.visky
#   * a clean git tree: EAS builds the last commit, not the working copy
#
# Credentials are NOT part of this script. EAS holds the distribution
# certificate and the provisioning profiles; the first run of
# `eas credentials -p ios` creates them. See scripts/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PROFILE="${PROFILE:-production}"
SUBMIT=1
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-submit) SUBMIT=0 ;;
    --submit-last) BUILD=0 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

echo "==> eas whoami"
npx eas-cli@latest whoami

if [ "$BUILD" -eq 1 ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "!! git tree is dirty — EAS builds the last commit. Commit first." >&2
    exit 1
  fi

  # The watch target adds a SECOND bundle id (com.envarg.visky.watchkitapp) that
  # needs its own provisioning profile. --non-interactive cannot create one, so
  # the very first store build has to run interactively once; after that the
  # profile is on EAS and this stays unattended.
  echo "==> EAS build (ios, profile=$PROFILE)${SUBMIT:+ with auto-submit}"
  npx eas-cli@latest build \
    --platform ios \
    --profile "$PROFILE" \
    --non-interactive \
    ${SUBMIT:+--auto-submit}
else
  [ "$SUBMIT" -eq 1 ] || { echo "!! --submit-last with --no-submit does nothing" >&2; exit 1; }
  echo "==> submitting the latest EAS iOS build (profile=$PROFILE)"
  npx eas-cli@latest submit \
    --platform ios \
    --profile "$PROFILE" \
    --latest \
    --non-interactive
fi

if [ "$SUBMIT" -eq 1 ]; then
  cat <<'NOTE'

==> done. The build is uploaded to App Store Connect.

Apple still has to process it (10–30 min). After that:
  * TestFlight — usable immediately by internal testers; external testers wait
    for a short Beta App Review.
  * App Store — App Store Connect > the version > "Add for Review". Manual.
NOTE
else
  echo "==> done. Build hosted on expo.dev, not submitted."
fi

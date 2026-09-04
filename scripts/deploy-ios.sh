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
#   * a paid Apple Developer Program membership
#   * the app record in App Store Connect (ascAppId 6808513521 in eas.json)
#   * a clean git tree: EAS builds the last commit, not the working copy
#   * the App Store Connect API key at $ASC_KEY_PATH
#
# NO INTERACTIVE APPLE LOGIN. Everything authenticates with the App Store
# Connect API key below, so this runs unattended — no 2FA prompt, no Apple ID
# password, no cookie session that expires after a few days. The one thing the
# key cannot do is create itself: see scripts/README.md.
#
# Credentials themselves are NOT created here. EAS holds the distribution
# certificate and BOTH provisioning profiles (the watch app has its own bundle
# id and so needs its own profile); `eas credentials:configure-build -p ios`
# made them and only has to run again when they expire.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PROFILE="${PROFILE:-production}"
SUBMIT=1
BUILD=1

# --- App Store Connect API key -------------------------------------------
# Key id and issuer id are identifiers, not secrets, so they live here. The
# .p8 is the secret and stays outside the repo; `certs/` and `*.p8` are
# gitignored precisely so a stray copy cannot be committed.
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/apple-signing/AuthKey_PNX776L4UV.p8}"
export EXPO_ASC_API_KEY_PATH="$ASC_KEY_PATH"
export EXPO_ASC_KEY_ID="${EXPO_ASC_KEY_ID:-PNX776L4UV}"
export EXPO_ASC_ISSUER_ID="${EXPO_ASC_ISSUER_ID:-b0b6e5ca-3cd8-43b6-992e-5c53e65b03ae}"
export EXPO_APPLE_TEAM_ID="${EXPO_APPLE_TEAM_ID:-N853W9Q344}"
# Without the team TYPE eas-cli silently never reaches authentication and
# reports the app as missing from App Store Connect instead.
export EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-INDIVIDUAL}"

# eas-cli mirrors app.json entitlements onto the Apple App IDs before every
# build. On com.envarg.visky.watchkitapp that request is rejected outright:
#
#   Apple API error: The request entity is not a valid request document object
#   - Unexpected or invalid value at
#     'data.relationships.bundleIdCapabilities.data.[0].attributes'
#
# The watch App ID carries CARPLAY_PLAYABLE_CONTENT, a deprecated capability
# that needs attributes eas-cli does not send — and one a watch app cannot use
# anyway. Syncing off makes the Apple developer portal the source of truth for
# capabilities: change them THERE, not in app.json, or the build silently
# lacks them.
export EXPO_NO_CAPABILITY_SYNC="${EXPO_NO_CAPABILITY_SYNC:-1}"

for arg in "$@"; do
  case "$arg" in
    --no-submit) SUBMIT=0 ;;
    --submit-last) BUILD=0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

[ -f "$ASC_KEY_PATH" ] || {
  echo "!! App Store Connect API key not found at:" >&2
  echo "   $ASC_KEY_PATH" >&2
  echo "   Apple hands the .p8 over exactly once, at creation. If it is lost," >&2
  echo "   the key cannot be re-downloaded — revoke it and generate another." >&2
  exit 1
}

# eas submit reads the key ONLY from the submit profile in eas.json — never from
# the environment, and it needs all three of ascApiKeyPath/ascApiKeyId/
# ascApiKeyIssuerId or it silently falls back to the EAS credentials service.
# The path there is relative (`.asc-key.p8`, resolved against this directory) so
# that eas.json stays portable and carries nobody's home directory. This is the
# link that makes it point at the real key, and it is a SYMLINK on purpose:
# a copy would mean two private keys to keep track of instead of one.
ln -sfn "$ASC_KEY_PATH" "$APP_DIR/.asc-key.p8"

echo "==> eas whoami"
npx eas-cli@latest whoami

if [ "$BUILD" -eq 1 ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "!! git tree is dirty — EAS builds the last commit. Commit first." >&2
    exit 1
  fi

  # The watch target is a SECOND bundle id (com.envarg.visky.watchkitapp) with
  # its own provisioning profile. eas-cli does not discover it from the Xcode
  # project — for a CNG project it reads the target list ONLY from
  # extra.eas.build.experimental.ios.appExtensions in app.json. Drop that entry
  # and the watch silently goes unsigned.
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

#!/usr/bin/env bash
# Build the iOS app ON THIS MACHINE and upload it to App Store Connect, with no
# EAS anywhere in the path.
#
# WHAT IS DIFFERENT FROM deploy-ios.sh. That script hands a git commit to EAS,
# which builds it in the cloud and submits it. This one runs xcodebuild here,
# against the WORKING TREE, and uploads the .ipa with altool. Nothing is sent to
# expo.dev, no eas-cli login is needed, and the only remote service involved is
# Apple's own.
#
# The trade is that everything EAS was quietly doing now has to be done here:
#
#   * `expo prebuild` — app/ios is gitignored and generated, so it has to be
#     regenerated or it silently builds a stale project;
#   * the build number — EAS kept it with `appVersionSource: remote`. Here it is
#     read back from App Store Connect (see scripts/lib/next-build-number.js);
#   * the provisioning profiles — found by bundle id among the installed ones,
#     because EAS names them with a timestamp and hardcoding that would rot.
#
# Usage:
#   scripts/deploy-ios-local.sh                 # build + upload
#   scripts/deploy-ios-local.sh --no-upload     # build only, keep the .ipa
#   scripts/deploy-ios-local.sh --no-prebuild   # reuse app/ios as it stands
#   BUILD_NUMBER=42 scripts/deploy-ios-local.sh # override the number
#
# Requires: Xcode, the distribution certificate in the login keychain, both
# App Store provisioning profiles installed, and the App Store Connect API key
# at $ASC_KEY_PATH. `scripts/deploy-ios.sh` documents where the key comes from.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
IOS_DIR="$APP_DIR/ios"
BUILD_DIR="$APP_DIR/build/ios-local"

TEAM_ID="${APPLE_TEAM_ID:-N853W9Q344}"
SCHEME="${IOS_SCHEME:-visky}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/apple-signing/AuthKey_PNX776L4UV.p8}"
ASC_KEY_ID="${ASC_KEY_ID:-PNX776L4UV}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-b0b6e5ca-3cd8-43b6-992e-5c53e65b03ae}"

UPLOAD=1
PREBUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    --no-prebuild) PREBUILD=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# 0. Preflight — fail here rather than after a twenty-minute archive
# ---------------------------------------------------------------------------
command -v xcodebuild >/dev/null || { echo "!! xcodebuild not on PATH" >&2; exit 1; }

security find-identity -v -p codesigning | grep -q "iPhone Distribution\|Apple Distribution" || {
  echo "!! no distribution certificate in the login keychain." >&2
  echo "   scripts/README.md covers importing it from the EAS export." >&2
  exit 1
}

[ -f "$ASC_KEY_PATH" ] || {
  echo "!! no App Store Connect API key at $ASC_KEY_PATH" >&2
  exit 1
}

"$ROOT/scripts/sync-version.sh" --check

VERSION="$(node -p "require('$ROOT/api/package.json').version")"

# ---------------------------------------------------------------------------
# 1. The native project
# ---------------------------------------------------------------------------
if [ "$PREBUILD" -eq 1 ]; then
  echo "==> expo prebuild (ios)"
  cd "$APP_DIR"
  # --no-install: pods are installed below, and letting prebuild do it as well
  # just doubles the slowest step.
  npx expo prebuild --platform ios --no-install
  echo "==> pod install"
  (cd ios && pod install)
else
  echo "==> reusing app/ios as it stands"
  [ -d "$IOS_DIR" ] || { echo "!! app/ios does not exist — run without --no-prebuild" >&2; exit 1; }
fi

# ---------------------------------------------------------------------------
# 2. The build number, from the store
# ---------------------------------------------------------------------------
if [ -n "${BUILD_NUMBER:-}" ]; then
  echo "==> build number $BUILD_NUMBER (from the environment)"
else
  BUILD_NUMBER="$("$ROOT/scripts/lib/next-build-number.js" ios)"
  echo "==> build number $BUILD_NUMBER (next after what App Store Connect has)"
fi

# CFBundleVersion has to be set on BOTH targets: Apple rejects an archive whose
# watch app disagrees with its host about the build it belongs to.
for plist in "$IOS_DIR/visky/Info.plist" "$IOS_DIR/viskyWatch/Info.plist"; do
  [ -f "$plist" ] || continue
  plutil -replace CFBundleVersion -string "$BUILD_NUMBER" "$plist"
  plutil -replace CFBundleShortVersionString -string "$VERSION" "$plist"
  printf '    %-28s %s (%s)\n' "$(basename "$(dirname "$plist")")" "$VERSION" "$BUILD_NUMBER"
done

# ---------------------------------------------------------------------------
# 3. Export options, with the profiles discovered rather than named
# ---------------------------------------------------------------------------
# EAS names its profiles "*[expo] <bundle id> AppStore <timestamp>", so the name
# changes every time they are regenerated. Match on the application-identifier
# inside each installed profile instead; that is stable.
profile_for() {
  local wanted="$TEAM_ID.$1" dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  local p decoded appid
  [ -d "$dir" ] || return 1
  for p in "$dir"/*.mobileprovision; do
    [ -f "$p" ] || continue
    decoded="$(security cms -D -i "$p" 2>/dev/null)" || continue
    appid="$(printf '%s' "$decoded" | plutil -extract Entitlements.application-identifier raw - 2>/dev/null)" || continue
    if [ "$appid" = "$wanted" ]; then
      printf '%s' "$decoded" | plutil -extract UUID raw - 2>/dev/null
      return 0
    fi
  done
  return 1
}

APP_PROFILE="$(profile_for com.envarg.visky)" || {
  echo "!! no installed provisioning profile for com.envarg.visky" >&2
  echo "   Export them from EAS — scripts/README.md has the steps." >&2
  exit 1
}
WATCH_PROFILE="$(profile_for com.envarg.visky.watchkitapp)" || {
  echo "!! no installed provisioning profile for com.envarg.visky.watchkitapp." >&2
  echo "   The watch app is a separate bundle id and needs its own." >&2
  exit 1
}
echo "==> profiles: app $APP_PROFILE, watch $WATCH_PROFILE"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
ARCHIVE="$BUILD_DIR/visky.xcarchive"
EXPORT_PLIST="$BUILD_DIR/ExportOptions.plist"

cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.envarg.visky</key><string>$APP_PROFILE</string>
    <key>com.envarg.visky.watchkitapp</key><string>$WATCH_PROFILE</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

# ---------------------------------------------------------------------------
# 4. Archive and export
# ---------------------------------------------------------------------------
echo "==> xcodebuild archive ($SCHEME, Release) — this is the slow part"
cd "$IOS_DIR"
xcodebuild archive \
  -workspace "visky.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  | tail -5

[ -d "$ARCHIVE" ] || { echo "!! archive was not produced" >&2; exit 1; }

echo "==> xcodebuild -exportArchive"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$BUILD_DIR" \
  | tail -5

IPA="$(find "$BUILD_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
[ -n "$IPA" ] || { echo "!! no .ipa in $BUILD_DIR" >&2; exit 1; }
printf '==> built %s (%s)\n' "$IPA" "$(du -h "$IPA" | cut -f1)"

# ---------------------------------------------------------------------------
# 5. Upload
# ---------------------------------------------------------------------------
if [ "$UPLOAD" -eq 0 ]; then
  echo
  echo "==> done. Not uploaded. The archive and .ipa are in:"
  echo "    $BUILD_DIR"
  exit 0
fi

# altool looks the key up by id in these directories and nowhere else — it takes
# the id, never a path.
export API_PRIVATE_KEYS_DIR="$(dirname "$ASC_KEY_PATH")"

echo "==> validating with App Store Connect"
xcrun altool --validate-app -f "$IPA" --type ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> uploading"
xcrun altool --upload-app -f "$IPA" --type ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

cat <<NOTE

==> done. $VERSION ($BUILD_NUMBER) is uploaded to App Store Connect.

Apple still has to process it, usually 5-30 minutes. After that it appears in
TestFlight and can be attached to a version. Nothing here submits it for
review — that stays a deliberate, separate step.
NOTE

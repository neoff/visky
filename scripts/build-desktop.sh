#!/usr/bin/env bash
# Build the macOS desktop player: the Expo bundle exported for platform `web`,
# wrapped in the Electron shell in desktop/, packaged as an UNSIGNED .dmg and
# .pkg you can carry to another Mac.
#
# One command does the whole thing — export, icon, package:
#
#   scripts/build-desktop.sh                  # dmg + pkg, universal (Intel + Apple Silicon)
#   scripts/build-desktop.sh --dmg            # dmg only (faster)
#   scripts/build-desktop.sh --pkg            # pkg only
#   scripts/build-desktop.sh --arch arm64     # or x64, or universal (default)
#   scripts/build-desktop.sh --skip-bundle    # reuse desktop/web, repackage only
#   scripts/build-desktop.sh --run            # do not package; launch it locally
#   scripts/build-desktop.sh --unsigned       # skip signing entirely
#
# SIGNED by default with the Developer ID certificates in the login keychain,
# pinned by SHA-1 in desktop/package.json because two of each live there.
#
# NOTARISATION runs only when Apple credentials are in the environment; without
# them the build is signed but not notarised, and macOS still quarantines it
# after a transfer. Either set:
#
#   APPLE_API_KEY=/path/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=<uuid>
#
# or:
#
#   APPLE_ID=en.varg@me.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx \
#     APPLE_TEAM_ID=N853W9Q344
#
# Requires: macOS with Xcode command line tools (for iconutil/sips), node, and
# app/node_modules already installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
DESKTOP_DIR="$ROOT/desktop"
WEB_OUT="$DESKTOP_DIR/web"
ICON_SRC="$APP_DIR/assets/icon.png"
ICON_OUT="$DESKTOP_DIR/build/icon.icns"

ARCH="universal"
TARGETS=()
SKIP_BUNDLE=0
RUN_ONLY=0
UNSIGNED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dmg) TARGETS+=("dmg") ;;
    --pkg) TARGETS+=("pkg") ;;
    --arch) shift; ARCH="${1:-universal}" ;;
    --skip-bundle) SKIP_BUNDLE=1 ;;
    --run) RUN_ONLY=1 ;;
    --unsigned) UNSIGNED=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

if [ ${#TARGETS[@]} -eq 0 ]; then TARGETS=("dmg" "pkg"); fi

case "$ARCH" in
  universal|arm64|x64) ;;
  *) echo "unknown arch: $ARCH (expected universal, arm64 or x64)" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------------------
# 1. The web bundle
# ---------------------------------------------------------------------------
if [ "$SKIP_BUNDLE" -eq 0 ]; then
  echo "==> exporting the Expo bundle for platform web"
  rm -rf "$WEB_OUT"
  cd "$APP_DIR"
  # EXPO_PUBLIC_DEV must not be "true": constants/index.ts swings baseHost to
  # localhost:3000 when it is, and a desktop app pointing at a dev server that
  # is not running looks exactly like a broken build.
  EXPO_PUBLIC_DEV=false npx expo export -p web --output-dir "$WEB_OUT"
else
  echo "==> reusing the bundle already in desktop/web"
  [ -f "$WEB_OUT/index.html" ] || { echo "no bundle there yet — run without --skip-bundle" >&2; exit 1; }
fi

# ---------------------------------------------------------------------------
# 2. The icon
# ---------------------------------------------------------------------------
# Rebuilt only when the source is newer, because iconutil is slow enough to
# notice on a repeat build.
if [ ! -f "$ICON_OUT" ] || [ "$ICON_SRC" -nt "$ICON_OUT" ]; then
  echo "==> generating $(basename "$ICON_OUT") from assets/icon.png"
  mkdir -p "$DESKTOP_DIR/build"
  ICONSET="$(mktemp -d)/icon.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z $((size * 2)) $((size * 2)) "$ICON_SRC" \
      --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$ICON_OUT"
  rm -rf "$(dirname "$ICONSET")"
fi

# ---------------------------------------------------------------------------
# 3. Version, kept in step with the phone app
# ---------------------------------------------------------------------------
VERSION="$(node -p "require('$APP_DIR/app.json').expo.version")"
node -e "
  const fs = require('fs');
  const file = '$DESKTOP_DIR/package.json';
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (pkg.version !== '$VERSION') {
    pkg.version = '$VERSION';
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  }
"
echo "==> version $VERSION"

cd "$DESKTOP_DIR"
[ -d node_modules ] || { echo "==> installing desktop dependencies"; npm install --no-audit --no-fund; }

if [ "$RUN_ONLY" -eq 1 ]; then
  echo "==> launching locally (no packaging)"
  exec npx electron .
fi

# ---------------------------------------------------------------------------
# 4. Package
# ---------------------------------------------------------------------------
# Signing identities are pinned by SHA-1 in package.json. Fail here rather than
# 20 minutes into a universal build if they are missing from the keychain.
APP_ID="$(node -p "require('$DESKTOP_DIR/package.json').build.mac.identity")"
PKG_ID="$(node -p "require('$DESKTOP_DIR/package.json').build.pkg.identity")"

BUILDER_ARGS=()
if [ "$UNSIGNED" -eq 1 ]; then
  MODE="unsigned"
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  BUILDER_ARGS+=("-c.mac.identity=null" "-c.pkg.identity=null" "-c.mac.notarize=false")
else
  for id in "$APP_ID" "$PKG_ID"; do
    security find-identity -v | grep -q "$id" || {
      echo "!! signing identity $id is not in the keychain." >&2
      echo "   Install the Developer ID certificates, or build with --unsigned." >&2
      exit 1
    }
  done

  # notarytool takes either an App Store Connect API key or an Apple ID with an
  # app-specific password. Neither present means signing still happens, but the
  # artifact stays quarantined on the receiving Mac.
  if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; then
    MODE="signed + notarised (App Store Connect API key)"
  elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
    MODE="signed + notarised (Apple ID)"
    export APPLE_TEAM_ID="${APPLE_TEAM_ID:-N853W9Q344}"
  else
    MODE="signed, NOT notarised (no Apple credentials in the environment)"
    BUILDER_ARGS+=("-c.mac.notarize=false")
  fi
fi

echo "==> packaging: ${TARGETS[*]} ($ARCH), $MODE"
rm -rf "$DESKTOP_DIR/dist"
npx electron-builder --mac "${TARGETS[@]}" "--$ARCH" "${BUILDER_ARGS[@]}"

echo
echo "==> done. Artifacts:"
find "$DESKTOP_DIR/dist" -maxdepth 1 \( -name '*.dmg' -o -name '*.pkg' \) -print0 |
  while IFS= read -r -d '' artifact; do
    printf '    %s  (%s)\n' "$artifact" "$(du -h "$artifact" | cut -f1)"
  done

if [ "$UNSIGNED" -eq 1 ] || [ -z "${APPLE_API_KEY:-}${APPLE_ID:-}" ]; then
  cat <<'NOTE'

Not notarised, so macOS quarantines the build after any transfer (AirDrop,
download, USB). On the OTHER laptop, once:

    xattr -dr com.apple.quarantine /Applications/visky.app

NOTE
else
  echo
  echo "==> notarised and stapled. It opens on any Mac with no xattr dance."
fi

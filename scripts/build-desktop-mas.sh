#!/usr/bin/env bash
# Build the macOS desktop player FOR THE MAC APP STORE and upload it to App
# Store Connect.
#
# This is a second pipeline beside scripts/build-desktop.sh, not a flag on it,
# because the App Store wants the opposite of what direct distribution wants:
#
#                      Developer ID (build-desktop.sh)   App Store (this)
#   application cert   Developer ID Application          3rd Party Mac Developer Application
#   installer cert     Developer ID Installer            3rd Party Mac Developer Installer
#   sandbox            no                                REQUIRED (entitlements.mas.plist)
#   provisioning       none                              embedded.provisionprofile
#   Apple's check      notarisation                      App Review
#   ships as           .dmg / .pkg the user downloads    .pkg uploaded, never handed out
#
# The .pkg this produces is an UPLOAD ARTIFACT. It is signed with the installer
# certificate the store expects and macOS will refuse to open it by hand —
# that is correct and not a failure.
#
# Usage:
#   scripts/build-desktop-mas.sh                 # build, sign, package, validate
#   scripts/build-desktop-mas.sh --upload        # ...and send it to App Store Connect
#   scripts/build-desktop-mas.sh --build 7       # set CFBundleVersion (see below)
#   scripts/build-desktop-mas.sh --arch arm64    # or x64, or universal (default)
#   scripts/build-desktop-mas.sh --skip-bundle   # reuse desktop/web
#
# Requires, and checked below with a message that says where to get each:
#   * both "3rd Party Mac Developer" certificates in the keychain;
#   * a Mac App Store provisioning profile for com.envarg.visky.desktop at
#     $MAS_PROFILE (default desktop/shell/embedded.provisionprofile);
#   * for --upload, the App Store Connect API key — the same one
#     scripts/deploy-ios.sh uses.
#
# NOTHING HERE PUBLISHES. The upload lands in App Store Connect as a build
# waiting for review; submitting it, and releasing it after review, stay manual
# clicks — a release is not something a script should trigger by accident.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
DESKTOP_DIR="$ROOT/desktop"
SHELL_DIR="$DESKTOP_DIR/shell"
WEB_OUT="$DESKTOP_DIR/web"
DIST="$DESKTOP_DIR/dist-mas"

BUNDLE_ID="${MAS_BUNDLE_ID:-com.envarg.visky}"
TEAM_ID="${APPLE_TEAM_ID:-N853W9Q344}"
ENTITLEMENTS="$SHELL_DIR/entitlements.mas.plist"
MAS_PROFILE="${MAS_PROFILE:-$SHELL_DIR/embedded.provisionprofile}"

# By name, not by SHA-1: these two do not exist yet on this machine, and a
# placeholder hash would be a worse error message than a name that simply does
# not match anything.
APP_CERT="${MAS_APP_CERT:-3rd Party Mac Developer Application: Evgeny Nesterov ($TEAM_ID)}"
PKG_CERT="${MAS_PKG_CERT:-3rd Party Mac Developer Installer: Evgeny Nesterov ($TEAM_ID)}"

ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/apple-signing/AuthKey_PNX776L4UV.p8}"
ASC_KEY_ID="${EXPO_ASC_KEY_ID:-PNX776L4UV}"
ASC_ISSUER_ID="${EXPO_ASC_ISSUER_ID:-b0b6e5ca-3cd8-43b6-992e-5c53e65b03ae}"

ARCH="universal"
SKIP_BUNDLE=0
UPLOAD=0
BUILD_NUMBER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --arch) shift; ARCH="${1:-universal}" ;;
    --build) shift; BUILD_NUMBER="${1:-}" ;;
    --skip-bundle) SKIP_BUNDLE=1 ;;
    --upload) UPLOAD=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

case "$ARCH" in
  universal) RUST_TARGET="universal-apple-darwin"; NEEDED=(x86_64-apple-darwin aarch64-apple-darwin) ;;
  arm64)     RUST_TARGET="aarch64-apple-darwin";   NEEDED=(aarch64-apple-darwin) ;;
  x64)       RUST_TARGET="x86_64-apple-darwin";    NEEDED=(x86_64-apple-darwin) ;;
  *) echo "unknown arch: $ARCH (expected universal, arm64 or x64)" >&2; exit 1 ;;
esac

BUNDLE_DIR="$SHELL_DIR/target/$RUST_TARGET/release/bundle"
APP="$DIST/visky.app"

# Same keg-only rustup problem as in build-desktop.sh: a non-interactive shell
# never reads the profile line that puts cargo's shims on PATH.
if ! command -v cargo >/dev/null 2>&1; then
  for dir in \
    "$(command -v rustup >/dev/null 2>&1 && dirname "$(rustup which cargo 2>/dev/null)" || true)" \
    "$HOME/.cargo/bin" \
    /opt/homebrew/opt/rustup/bin \
    /usr/local/opt/rustup/bin
  do
    if [ -n "$dir" ] && [ -x "$dir/cargo" ]; then export PATH="$dir:$PATH"; break; fi
  done
fi
command -v cargo >/dev/null 2>&1 || {
  echo "!! cargo is not on PATH. brew install rustup && rustup default stable" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 0. Everything Apple has to have given us first
# ---------------------------------------------------------------------------
missing=0

for cert in "$APP_CERT" "$PKG_CERT"; do
  if ! security find-identity -v | grep -qF "$cert"; then
    echo "!! missing signing identity: $cert" >&2
    missing=1
  fi
done

if [ ! -f "$MAS_PROFILE" ]; then
  echo "!! missing the Mac App Store provisioning profile: $MAS_PROFILE" >&2
  missing=1
fi

if [ "$missing" -eq 1 ]; then
  cat >&2 <<NOTE

None of these can be created from a script: each one needs an interactive
Apple login (en.varg@me.com) with 2FA. In the Apple developer portal:

  1. Certificates -> "Mac App Distribution" and "Mac Installer Distribution".
     They install into the keychain as the two "3rd Party Mac Developer"
     identities this script looks for.
  2. Profiles -> a "Mac App Store" profile for App ID $BUNDLE_ID, saved as
       $MAS_PROFILE
     (both of these can also be done with the App Store Connect API key — see
     docs/ for the scripts that did it.)
  3. App Store Connect -> open the existing app record and ADD THE macOS
     PLATFORM to it. This one has no API: the App Store Connect API cannot
     create app records or add platforms, so it is a click in the web UI and
     nothing here can do it for you. Without it the upload has nowhere to land
     and altool rejects it.

NOTE
  exit 1
fi

if [ "$UPLOAD" -eq 1 ] && [ ! -f "$ASC_KEY_PATH" ]; then
  echo "!! --upload needs the App Store Connect API key, and there is no file at:" >&2
  echo "   $ASC_KEY_PATH   (override with ASC_KEY_PATH=...)" >&2
  exit 1
fi

for t in "${NEEDED[@]}"; do
  rustup target list --installed 2>/dev/null | grep -q "^$t$" || {
    echo "!! rust target $t is not installed: rustup target add ${NEEDED[*]}" >&2
    exit 1
  }
done

# ---------------------------------------------------------------------------
# 1. Version, taken from the api
# ---------------------------------------------------------------------------
# The api is the source of the version for everything (see sync-version.sh for
# why). It writes shell/tauri.conf.json among the rest, so this script no longer
# edits that file itself.
"$ROOT/scripts/sync-version.sh"
VERSION="$(node -p "require('$ROOT/api/package.json').version")"

# ---------------------------------------------------------------------------
# 2. The web bundle
# ---------------------------------------------------------------------------
if [ "$SKIP_BUNDLE" -eq 0 ]; then
  echo "==> exporting the Expo bundle for platform web"
  cd "$APP_DIR"
  EXPO_PUBLIC_DEV=false npx expo export -p web --output-dir "$WEB_OUT" --clear
else
  [ -f "$WEB_OUT/index.html" ] || { echo "no bundle in desktop/web yet" >&2; exit 1; }
fi

cd "$DESKTOP_DIR"
[ -d node_modules ] || npm install --no-audit --no-fund

# ---------------------------------------------------------------------------
# 3. The shell, built UNSIGNED
# ---------------------------------------------------------------------------
# Tauri signs with whatever APPLE_SIGNING_IDENTITY holds and knows nothing
# about sandboxes or embedded profiles, so it would sign the bundle once
# without them and every signature below would have to replace it. Building
# unsigned and signing once, in the right order, is the shorter path.
echo "==> building the shell ($ARCH), unsigned — signing happens below"
cd "$SHELL_DIR"
env -u APPLE_SIGNING_IDENTITY -u APPLE_CERTIFICATE -u APPLE_API_KEY -u APPLE_ID \
  npx --prefix "$DESKTOP_DIR" tauri build --bundles app --target "$RUST_TARGET"

rm -rf "$DIST"
mkdir -p "$DIST"
cp -R "$BUNDLE_DIR/macos/visky.app" "$APP"

# ---------------------------------------------------------------------------
# 4. Build number
# ---------------------------------------------------------------------------
# App Store Connect rejects a build whose CFBundleVersion it has seen before,
# and Tauri writes the marketing version into both keys. Bump this on every
# upload of the same version.
if [ -n "$BUILD_NUMBER" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP/Contents/Info.plist"
  echo "==> CFBundleVersion $BUILD_NUMBER"
fi

# THE IDENTIFIER IS REWRITTEN HERE, not in shell/tauri.conf.json.
#
# Two channels ship this app and they are different products to macOS: the
# Developer ID build keeps com.envarg.visky.desktop, and rewriting the file
# would change what that build installs as — a different container, a lost
# pairing — for everyone already running it. The store copy takes the PHONE
# app's id instead, which is what lets it join the existing App Store Connect
# record as the macOS platform rather than needing a second listing.
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$APP/Contents/Info.plist"
echo "==> CFBundleIdentifier $BUNDLE_ID"

# The store requires a category, and rejects the upload — after the whole
# build — when it is missing.
/usr/libexec/PlistBuddy -c "Print :LSApplicationCategoryType" "$APP/Contents/Info.plist" >/dev/null 2>&1 || {
  /usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.music" "$APP/Contents/Info.plist"
}

# ---------------------------------------------------------------------------
# 5. Profile and signature
# ---------------------------------------------------------------------------
cp "$MAS_PROFILE" "$APP/Contents/embedded.provisionprofile"

# Inside out: a nested binary signed AFTER its container invalidates the
# container's signature, and the outer seal is the one the store checks.
echo "==> signing"
while IFS= read -r -d '' nested; do
  codesign --force --timestamp --sign "$APP_CERT" "$nested"
done < <(find "$APP/Contents" \( -name '*.dylib' -o -name '*.framework' -o -name '*.app' \) -mindepth 2 -print0)

codesign --force --timestamp --sign "$APP_CERT" --entitlements "$ENTITLEMENTS" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

# What the store will check first, and the one thing worth reading in this
# output: the sandbox must be on and the identifier must match the profile.
codesign -d --entitlements - --xml "$APP" | plutil -p - | sed 's/^/    /'

# ---------------------------------------------------------------------------
# 6. The installer package
# ---------------------------------------------------------------------------
PKG="$DIST/visky-${VERSION}-${ARCH}-mas.pkg"
echo "==> building the upload package"
COMPONENT="$(mktemp -d)/component.pkg"
pkgbuild --install-location /Applications --component "$APP" "$COMPONENT" >/dev/null
productbuild --package "$COMPONENT" --sign "$PKG_CERT" "$PKG" >/dev/null
rm -rf "$(dirname "$COMPONENT")"

# ---------------------------------------------------------------------------
# 7. Validate, and upload only when asked
# ---------------------------------------------------------------------------
ALTOOL=(xcrun altool --type macos --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID")
# altool finds the key by id in these directories and nowhere else.
export API_PRIVATE_KEYS_DIR="$(dirname "$ASC_KEY_PATH")"

if [ -f "$ASC_KEY_PATH" ]; then
  echo "==> validating with App Store Connect"
  "${ALTOOL[@]}" --validate-app -f "$PKG"
else
  echo "==> no API key on hand; skipping validation"
fi

if [ "$UPLOAD" -eq 1 ]; then
  echo "==> uploading"
  "${ALTOOL[@]}" --upload-app -f "$PKG"
  echo
  echo "Uploaded. It appears in App Store Connect after processing (10-30 min)."
  echo "Submitting it for review, and releasing it after, stay manual."
fi

echo
echo "==> done"
printf '    %s  (%s)\n' "$APP" "$(du -sh "$APP" | cut -f1)"
printf '    %s  (%s)\n' "$PKG" "$(du -h "$PKG" | cut -f1)"

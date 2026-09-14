#!/usr/bin/env bash
# Build the macOS desktop player.
#
# The shell is TAURI: the Expo bundle exported for platform `web`, running in a
# WKWebView. The Electron shell it replaced is still in desktop-electron/ and
# still builds — see scripts/build-desktop-electron.sh — but this is the one
# that ships. It is ~16 MB against Electron's ~296 MB, and two of the three
# jobs the Electron shell was doing turned out not to be needed:
#
#   * an origin to serve the bundle from -> Tauri provides one itself;
#   * CORS headers for VK's CDN         -> WKWebView plays HLS natively, so the
#     media never goes through XHR and is never CORS-checked;
#   * an embedded browser for VK login  -> the desktop is paired from a phone
#     and never logs in to VK at all.
#
#   scripts/build-desktop.sh                  # dmg + pkg, universal (Intel + Apple Silicon)
#   scripts/build-desktop.sh --dmg            # dmg only (faster)
#   scripts/build-desktop.sh --pkg            # pkg only
#   scripts/build-desktop.sh --arch arm64     # or x64, or universal (default)
#   scripts/build-desktop.sh --skip-bundle    # reuse desktop/web, rebuild the shell only
#   scripts/build-desktop.sh --run            # do not package; launch it locally
#   scripts/build-desktop.sh --unsigned       # skip signing entirely
#
# EVERYTHING LANDS IN desktop/dist. Cargo keeps its own build cache under
# desktop/shell/target, one directory per architecture ever built — that is a
# cache, not output, and nothing there is meant to be shipped or hunted through.
#
# SIGNED by default with the two Developer ID certificates, pinned by SHA-1
# because two of each live in the keychain.
#
# NOTARISATION runs only when Apple credentials are in the environment. Either:
#
#   APPLE_API_KEY=/path/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=<uuid>
#
# or:
#
#   APPLE_ID=en.varg@me.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx \
#     APPLE_TEAM_ID=N853W9Q344
#
# Every artifact is submitted and stapled SEPARATELY — the .app, the .dmg and
# the .pkg each carry their own ticket. Tauri would notarise the bundles it
# produces on its own, but it has no .pkg bundler, so the installer would have
# gone out signed and unnotarised: Gatekeeper blocks that just as hard as an
# unsigned one. Doing all three here keeps one code path instead of two.
#
# Requires: macOS with the Xcode command line tools, node, rustup with both
# darwin targets (`rustup target add x86_64-apple-darwin aarch64-apple-darwin`),
# and app/node_modules already installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
DESKTOP_DIR="$ROOT/desktop"
SHELL_DIR="$DESKTOP_DIR/shell"
WEB_OUT="$DESKTOP_DIR/web"
DIST="$DESKTOP_DIR/dist"

# The same certificates scripts/build-desktop-electron.sh is pinned to.
APP_ID="E1D0E87A8D058E11042CB5927783A68C3947A199"
PKG_ID="A61D7C57F92E962E1270D7BB8186942CA16BC23F"

# ---------------------------------------------------------------------------
# 0. Find the Rust toolchain
# ---------------------------------------------------------------------------
# `rustup` is keg-only in Homebrew because it conflicts with the `rust` formula:
# only the `rustup` binary itself gets symlinked, while the `cargo` and `rustc`
# SHIMS stay in the keg and never reach PATH. The line that adds them lives in
# an interactive shell's profile, which this script — a non-interactive bash —
# does not read, so `tauri build` died on "failed to run command cargo
# metadata: No such file or directory".
#
# Look for the shims rather than depend on anybody's dotfiles.
if ! command -v cargo >/dev/null 2>&1; then
  for dir in \
    "$(command -v rustup >/dev/null 2>&1 && dirname "$(rustup which cargo 2>/dev/null)" || true)" \
    "$HOME/.cargo/bin" \
    /opt/homebrew/opt/rustup/bin \
    /usr/local/opt/rustup/bin
  do
    if [ -n "$dir" ] && [ -x "$dir/cargo" ]; then
      export PATH="$dir:$PATH"
      break
    fi
  done
fi

command -v cargo >/dev/null 2>&1 || {
  echo "!! cargo is not on PATH and could not be found." >&2
  echo "   Install the toolchain with:  brew install rustup && rustup default stable" >&2
  echo "   ...and put its shims on PATH: export PATH=\"/opt/homebrew/opt/rustup/bin:\$PATH\"" >&2
  exit 1
}

ARCH="universal"
TARGETS=()
SKIP_BUNDLE=0
RUN_ONLY=0
UNSIGNED=0
NOTARISE=0
NOTARY_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dmg) TARGETS+=("dmg") ;;
    --pkg) TARGETS+=("pkg") ;;
    --arch) shift; ARCH="${1:-universal}" ;;
    --skip-bundle) SKIP_BUNDLE=1 ;;
    --run) RUN_ONLY=1 ;;
    --unsigned) UNSIGNED=1 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

if [ ${#TARGETS[@]} -eq 0 ]; then TARGETS=("dmg" "pkg"); fi

case "$ARCH" in
  universal) RUST_TARGET="universal-apple-darwin"; NEEDED=(x86_64-apple-darwin aarch64-apple-darwin) ;;
  arm64)     RUST_TARGET="aarch64-apple-darwin";   NEEDED=(aarch64-apple-darwin) ;;
  x64)       RUST_TARGET="x86_64-apple-darwin";    NEEDED=(x86_64-apple-darwin) ;;
  *) echo "unknown arch: $ARCH (expected universal, arm64 or x64)" >&2; exit 1 ;;
esac

BUNDLE_DIR="$SHELL_DIR/target/$RUST_TARGET/release/bundle"

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
  # EXPO_PUBLIC_DEV must not be "true": constants/index.ts swings baseHost to
  # localhost:3000 when it is, and a desktop app pointing at a dev server that
  # is not running looks exactly like a broken build.
  EXPO_PUBLIC_DEV=false npx expo export -p web --output-dir "$WEB_OUT" --clear
else
  echo "==> reusing the bundle already in desktop/web"
  [ -f "$WEB_OUT/index.html" ] || { echo "no bundle there yet — run without --skip-bundle" >&2; exit 1; }
fi

cd "$DESKTOP_DIR"
[ -d node_modules ] || { echo "==> installing the Tauri CLI"; npm install --no-audit --no-fund; }

if [ "$RUN_ONLY" -eq 1 ]; then
  echo "==> launching locally (no packaging)"
  cd "$SHELL_DIR"
  exec npx --prefix "$DESKTOP_DIR" tauri dev --no-watch
fi

# ---------------------------------------------------------------------------
# 3. The shell
# ---------------------------------------------------------------------------
# Fail here rather than after a full release build.
for t in "${NEEDED[@]}"; do
  rustup target list --installed 2>/dev/null | grep -q "^$t$" || {
    echo "!! rust target $t is not installed. Add it with:" >&2
    echo "   rustup target add ${NEEDED[*]}" >&2
    exit 1
  }
done

if [ "$UNSIGNED" -eq 0 ]; then
  for id in "$APP_ID" "$PKG_ID"; do
    security find-identity -v | grep -q "$id" || {
      echo "!! signing identity $id is not in the keychain." >&2
      echo "   Install the Developer ID certificates, or build with --unsigned." >&2
      exit 1
    }
  done
  export APPLE_SIGNING_IDENTITY="$APP_ID"

  if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; then
    [ -f "$APPLE_API_KEY" ] || {
      echo "!! APPLE_API_KEY should be the path to the .p8, and there is no file at:" >&2
      echo "   $APPLE_API_KEY" >&2
      exit 1
    }
    NOTARY_ARGS=(--key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER")
    NOTARISE=1
    MODE="signed + notarised (App Store Connect API key)"
  elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
    NOTARY_ARGS=(--apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
                 --team-id "${APPLE_TEAM_ID:-N853W9Q344}")
    NOTARISE=1
    MODE="signed + notarised (Apple ID)"
  else
    MODE="signed, NOT notarised (no Apple credentials in the environment)"
  fi
else
  MODE="unsigned"
fi

# Send one artifact to Apple and staple the ticket into it.
#
# notarytool takes .zip, .dmg and .pkg only, so a .app has to be zipped for the
# trip — but the ticket is stapled into the ORIGINAL bundle, never into the zip,
# which is a throwaway. `ditto --keepParent` is what preserves the bundle's
# symlinks and extended attributes; a plain `zip -r` corrupts the signature.
notarise() {
  local artifact="$1" upload="$1" tmp="" out="" id=""
  [ "$NOTARISE" -eq 1 ] || return 0

  if [[ "$artifact" == *.app ]]; then
    tmp="$(mktemp -d)"
    upload="$tmp/$(basename "$artifact").zip"
    ditto -c -k --keepParent "$artifact" "$upload"
  fi

  echo "==> notarising $(basename "$artifact") — Apple's queue, usually 2-15 min"
  if ! out="$(xcrun notarytool submit "$upload" "${NOTARY_ARGS[@]}" --wait 2>&1)"; then
    echo "$out" >&2
    # The rejection itself never says WHY. The log behind the submission id does.
    id="$(printf '%s' "$out" | awk '/^ *id: /{print $2; exit}')"
    if [ -n "$id" ]; then
      echo "!! notarisation failed. Apple's log:" >&2
      xcrun notarytool log "$id" "${NOTARY_ARGS[@]}" >&2 || true
    fi
    [ -n "$tmp" ] && rm -rf "$tmp"
    exit 1
  fi
  printf '%s\n' "$out" | tail -2

  xcrun stapler staple "$artifact"
  # Not `[ -n "$tmp" ] && rm`: a false test as the last command would return 1
  # from the function, and `set -e` would read that as notarisation failing.
  if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
}

cd "$SHELL_DIR"
echo "==> building the shell ($ARCH), $MODE"

# Tauri notarises by itself whenever it finds Apple credentials in the
# environment, which would mean two mechanisms racing over the same bundles and
# still no ticket on the .pkg. Strip the variables it looks at from the child
# environment — APPLE_SIGNING_IDENTITY stays, signing IS Tauri's job — and let
# notarise() below be the only thing that talks to Apple.
TAURI=(env -u APPLE_API_KEY -u APPLE_API_KEY_PATH -u APPLE_API_ISSUER
           -u APPLE_ID -u APPLE_PASSWORD
       npx --prefix "$DESKTOP_DIR" tauri)

# The web bundle is compiled INTO the binary by tauri-codegen, so a fresh export
# means a rebuild of the shell even when no Rust changed.
"${TAURI[@]}" build --bundles app --target "$RUST_TARGET"

rm -rf "$DIST"
mkdir -p "$DIST"
# Copied out FIRST, and not only for tidiness: the dmg bundler deletes
# bundle/macos/visky.app once it has been folded into the image.
cp -R "$BUNDLE_DIR/macos/visky.app" "$DIST/visky.app"

# Stapled here, before the .pkg is built around it, so the installer ships a
# bundle that also validates offline. The copy inside the .dmg does not get this
# treatment — Tauri rebuilds the .app as part of the dmg bundling, so anything
# stapled beforehand is thrown away — but the .dmg carries its own ticket.
notarise "$DIST/visky.app"

# ---------------------------------------------------------------------------
# 4. The installers
# ---------------------------------------------------------------------------
DMG=""
PKG=""

for target in "${TARGETS[@]}"; do
  case "$target" in
    dmg)
      echo "==> building the disk image"
      # Tauri's own bundler, which lays the window out through Finder — the
      # background, the arrow and the two icon positions all come from
      # `bundle.macOS.dmg` in shell/tauri.conf.json and match what
      # electron-builder was producing. It will HANG if stale disk images are
      # still attached; `hdiutil info` is where to look if it ever does.
      "${TAURI[@]}" build --bundles dmg --target "$RUST_TARGET"
      DMG="$DIST/visky-${VERSION}-${ARCH}.dmg"
      mv "$BUNDLE_DIR/dmg/visky_${VERSION}"*.dmg "$DMG"
      notarise "$DMG"
      ;;
    pkg)
      # Tauri has no .pkg bundler, so this is pkgbuild directly. --component,
      # not --root: the app is the whole payload, and this keeps the installer
      # from inventing a directory layout around it.
      echo "==> building the installer package"
      PKG="$DIST/visky-${VERSION}-${ARCH}.pkg"
      COMPONENT="$(mktemp -d)/component.pkg"
      pkgbuild --install-location /Applications --component "$DIST/visky.app" "$COMPONENT" >/dev/null
      if [ "$UNSIGNED" -eq 0 ]; then
        # The INSTALLER certificate, a different one from the application
        # certificate the app itself is signed with.
        productbuild --package "$COMPONENT" --sign "$PKG_ID" --timestamp "$PKG" >/dev/null
      else
        productbuild --package "$COMPONENT" "$PKG" >/dev/null
      fi
      rm -rf "$(dirname "$COMPONENT")"
      notarise "$PKG"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 5. Report
# ---------------------------------------------------------------------------
echo
echo "==> done. $MODE"
printf '    %s  (%s)\n' "$DIST/visky.app" "$(du -sh "$DIST/visky.app" | cut -f1)"
# Same trap: on a --pkg-only build $DMG is empty, the `&&` returns 1, and the
# script used to die right here — after a successful build, before the report.
if [ -n "$DMG" ]; then printf '    %s  (%s)\n' "$DMG" "$(du -h "$DMG" | cut -f1)"; fi
if [ -n "$PKG" ]; then printf '    %s  (%s)\n' "$PKG" "$(du -h "$PKG" | cut -f1)"; fi

if [ "$NOTARISE" -eq 0 ]; then
  cat <<'NOTE'

Not notarised, so macOS quarantines the build after any transfer (AirDrop,
download, USB). On the OTHER laptop, once:

    xattr -dr com.apple.quarantine /Applications/visky.app

NOTE
else
  echo
  echo "==> notarised and stapled. It opens on any Mac with no xattr dance."
fi

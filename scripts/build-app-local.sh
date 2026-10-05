#!/usr/bin/env bash
# Build the Android app ON THIS MACHINE with Gradle and push it to Google Play,
# with no EAS anywhere in the path.
#
# WHAT IS DIFFERENT FROM build-app.sh. That script uses eas-cli — even its
# `--local` mode, which compiles here but still signs in to expo.dev and takes
# its credentials from the EAS credentials service. This one runs `gradlew
# bundleRelease` against the local keystore and uploads through the Play
# Developer API directly. No expo.dev account is involved at any point.
#
# Everything EAS was doing implicitly has to be explicit here:
#
#   * `expo prebuild` — app/android is gitignored and generated;
#   * the versionCode — EAS kept it remotely; here it is read back from Play
#     (scripts/lib/next-build-number.js);
#   * signing — the keystore exported from EAS, under ~/apple-signing.
#
# Usage:
#   scripts/build-app-local.sh                   # build + upload to internal
#   scripts/build-app-local.sh --no-upload       # build only, keep the .aab
#   scripts/build-app-local.sh --track alpha     # a different Play track
#   scripts/build-app-local.sh --no-prebuild     # reuse app/android as it is
#   VERSION_CODE=99 scripts/build-app-local.sh   # override the number
#
# Requires: the Android SDK and JDK 17 (newer JDKs break CMake), the keystore
# and its credentials.json under ~/apple-signing/eas-credentials, and the Play
# service-account json in certs/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"

# The API origin the SHIPPED bundle talks to.
#
# app/.env holds whatever server the developer is pointing at today — often
# http://localhost:3000 — and a release build must never bake that in: the app
# then fails every request in silence and shows the list it had cached, which is
# how the desktop player sat on a week-old playlist. constants/index.ts reads
# EXPO_PUBLIC_API_URL FIRST for that reason, and this is where it is set.
#
# Override for a build against something else: API_URL=http://192.168.1.5:3000
export EXPO_PUBLIC_API_URL="${API_URL:-https://frisky.envarg.com}"

ANDROID_DIR="$APP_DIR/android"
VAULT="${EAS_CREDENTIALS_DIR:-$HOME/apple-signing/eas-credentials}"

UPLOAD=1
PREBUILD=1
TRACK="internal"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-upload) UPLOAD=0 ;;
    --no-prebuild) PREBUILD=0 ;;
    --track) shift; TRACK="${1:?--track needs a value}" ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
CRED_JSON="$VAULT/credentials.json"
[ -f "$CRED_JSON" ] || {
  echo "!! no credentials.json at $CRED_JSON" >&2
  echo "   Export it once: eas credentials -p android -> credentials.json." >&2
  echo "   scripts/README.md has the walk-through." >&2
  exit 1
}

KEYSTORE_REL="$(node -p "require('$CRED_JSON').android.keystore.keystorePath")"
KEYSTORE="$VAULT/$KEYSTORE_REL"
[ -f "$KEYSTORE" ] || { echo "!! keystore missing at $KEYSTORE" >&2; exit 1; }

# The passwords stay in the file and go straight into Gradle's environment.
# They are never echoed, and never written into the project.
KEYSTORE_PASSWORD="$(node -p "require('$CRED_JSON').android.keystore.keystorePassword")"
KEY_ALIAS="$(node -p "require('$CRED_JSON').android.keystore.keyAlias")"
KEY_PASSWORD="$(node -p "require('$CRED_JSON').android.keystore.keyPassword")"

"$ROOT/scripts/sync-version.sh" --check
VERSION="$(node -p "require('$ROOT/api/package.json').version")"

# ---------------------------------------------------------------------------
# 1. The native project
# ---------------------------------------------------------------------------
if [ "$PREBUILD" -eq 1 ]; then
  echo "==> expo prebuild (android)"
  cd "$APP_DIR"
  npx expo prebuild --platform android --no-install
else
  echo "==> reusing app/android as it stands"
  [ -d "$ANDROID_DIR" ] || { echo "!! app/android does not exist — run without --no-prebuild" >&2; exit 1; }
fi

# ---------------------------------------------------------------------------
# 2. The versionCode, from Play
# ---------------------------------------------------------------------------
if [ -n "${VERSION_CODE:-}" ]; then
  echo "==> versionCode $VERSION_CODE (from the environment)"
else
  VERSION_CODE="$("$ROOT/scripts/lib/next-build-number.js" android)"
  echo "==> versionCode $VERSION_CODE (next after what Play has)"
fi

# WRITTEN INTO THE GENERATED GRADLE FILE, not passed as a property.
#
# `-PversionCode` below looks like it does this and does not: prebuild writes a
# LITERAL `versionCode <n>` into android/app/build.gradle, copied from
# app.json's expo.android.versionCode, and nothing in that file ever reads the
# property. The number computed above was therefore discarded on every build,
# and Play received whatever app.json happened to say — which is fine exactly
# once and then collides with itself ("Version code N has already been used").
#
# The edit lands in android/, which is gitignored and regenerated by prebuild,
# so it is temporary by construction — the same reason the signing details are
# passed on the command line rather than written to gradle.properties.
#
# app.json is deliberately NOT touched: it is tracked, and rewriting it on every
# build would leave the working tree dirty after a release.
GRADLE_APP="$ANDROID_DIR/app/build.gradle"
[ -f "$GRADLE_APP" ] || { echo "!! no $GRADLE_APP to set the versionCode in" >&2; exit 1; }
/usr/bin/sed -i '' -E "s/^([[:space:]]*)versionCode[[:space:]]+[0-9]+/\1versionCode $VERSION_CODE/" "$GRADLE_APP"
grep -qE "^[[:space:]]*versionCode[[:space:]]+$VERSION_CODE\$" "$GRADLE_APP" || {
  echo "!! failed to set versionCode $VERSION_CODE in $GRADLE_APP" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 3. Build
# ---------------------------------------------------------------------------
# Signing is passed on the command line rather than written into
# gradle.properties: android/ is regenerated by prebuild, so anything written
# there is both temporary and a place for a password to be left behind.
echo "==> gradlew bundleRelease — the slow part"
cd "$ANDROID_DIR"
./gradlew --quiet bundleRelease \
  -PversionCode="$VERSION_CODE" \
  -PversionName="$VERSION" \
  -Pandroid.injected.signing.store.file="$KEYSTORE" \
  -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$KEY_PASSWORD"

AAB="$(find "$ANDROID_DIR/app/build/outputs/bundle/release" -name '*.aab' | head -1)"
[ -n "$AAB" ] || { echo "!! no .aab was produced" >&2; exit 1; }
printf '==> built %s (%s)\n' "$AAB" "$(du -h "$AAB" | cut -f1)"

# Trust the artifact, not the flags: a bundle that silently came out unsigned
# is rejected by Play at the end of the upload, not at the start.
#
# THE LISTING IS TAKEN FIRST, AND ITS FAILURE IS A DIFFERENT FAILURE. Piping
# `unzip -l` straight into grep with stderr discarded reports "no signature" for
# a listing that never happened at all — and a correctly signed 1.5.53 bundle
# was stopped on its way to Play exactly that way, with the keystore, the alias
# and the signature all fine. The two outcomes now say different things.
#
# The match is on the archive's OWN signature, at the top level: an app's
# resources carry their own `base/root/META-INF/...` entries, which say nothing
# about who signed the bundle.
LISTING="$(unzip -l "$AAB" 2>&1)" || {
  echo "!! could not read $AAB to check its signature:" >&2
  printf '%s\n' "$LISTING" | tail -3 >&2
  exit 1
}
if ! printf '%s\n' "$LISTING" | grep -qE "[[:space:]]META-INF/[^/]+\.(RSA|EC|DSA)$"; then
  echo "!! the bundle carries no signature block — check the keystore settings" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Upload
# ---------------------------------------------------------------------------
if [ "$UPLOAD" -eq 0 ]; then
  echo
  echo "==> done. Not uploaded:"
  echo "    $AAB"
  exit 0
fi

echo "==> uploading to Google Play ($TRACK)"
"$ROOT/scripts/lib/play-upload.js" "$AAB" "$TRACK"

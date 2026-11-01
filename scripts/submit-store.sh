#!/usr/bin/env bash
# Take the builds Apple already has and turn them into a submitted update:
# version record, release notes, build, review submission.
#
# WHERE THIS SITS. `deploy-ios-local.sh` and `build-desktop-mas.sh` stop when
# Apple has the binary, on purpose — a build in TestFlight is not a release, and
# a script that submits as a side effect of building is a script that submits by
# accident. This is the deliberate step they stop short of, and the four clicks
# it replaces are the ones that are easy to get wrong: the wrong build picked
# from a list, release notes left on last version's text, a version record
# created for the wrong platform.
#
# Usage:
#   scripts/submit-store.sh                      # both platforms
#   scripts/submit-store.sh ios
#   scripts/submit-store.sh macos
#   scripts/submit-store.sh --notes "Fixes..."   # the release notes
#   scripts/submit-store.sh --notes-file NOTES.md
#   scripts/submit-store.sh --no-submit          # prepare, stop before submitting
#   scripts/submit-store.sh --dry-run            # say what it would do
#   scripts/submit-store.sh --version 1.5.52     # default: the api's version
#
# RELEASE NOTES COME FROM SOMEWHERE OR THIS FAILS. Apple requires What's New on
# an update and leaves it empty on a new version record. With no --notes and no
# --notes-file, `release-notes.md` at the repo root is used when it exists, and
# otherwise the run stops before it has changed anything.
#
# Needs the App Store Connect API key — the same one deploy-ios.sh documents,
# at $ASC_KEY_PATH (default ~/apple-signing/AuthKey_PNX776L4UV.p8). No browser,
# no Apple ID, no 2FA.
#
# NOTHING REACHES USERS HERE. This submits to review. Whether an approved
# version then goes live is the version's own release type, and whether that
# reaches anyone is App Availability — neither is touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE="$ROOT/scripts/lib/asc-release.js"
DEFAULT_NOTES="$ROOT/release-notes.md"

PLATFORMS=()
PASS=()
HAVE_NOTES=0

while [ $# -gt 0 ]; do
  case "$1" in
    ios|macos|mac)   PLATFORMS+=("$1") ;;
    both|all)        PLATFORMS+=(ios macos) ;;
    --notes|--notes-file)
      HAVE_NOTES=1
      PASS+=("$1" "${2:?$1 needs a value}")
      shift
      ;;
    --version)       PASS+=("$1" "${2:?--version needs a value}"); shift ;;
    --no-submit|--no-wait|--dry-run|--manual-release) PASS+=("$1") ;;
    -h|--help)       sed -n '2,33p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

[ ${#PLATFORMS[@]} -gt 0 ] || PLATFORMS=(ios macos)

# The repo-root file is a convenience, not a convention to learn: it is only
# consulted when nothing was passed, and its absence is not an error here —
# asc-release.js is the one that decides whether the notes were needed.
if [ "$HAVE_NOTES" -eq 0 ] && [ -f "$DEFAULT_NOTES" ]; then
  echo "==> release notes from $(basename "$DEFAULT_NOTES")"
  PASS+=(--notes-file "$DEFAULT_NOTES")
fi

command -v node >/dev/null || { echo "!! node is not on PATH" >&2; exit 1; }

# Each platform runs on its own so a failure on one says which, and so a second
# run picks up where the first stopped instead of redoing it.
for platform in "${PLATFORMS[@]}"; do
  node "$RELEASE" "$platform" "${PASS[@]}"
done

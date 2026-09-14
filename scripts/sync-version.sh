#!/usr/bin/env bash
# ONE version across every component, taken from the api.
#
# WHY THE API IS THE SOURCE. It is the only component that bumps on its own
# (`build-api.sh` runs `npm version`), and it is the thing every frontend has a
# dependency ON rather than the other way round. Pinning the frontends to it
# means a shipped app records which backend it was built against — including
# when the frontend itself did not change at all between two api releases. The
# alternative, letting each component carry its own number, answers "what is
# this build" but never "what does it need".
#
# So the frontend version is deliberately NOT a measure of frontend change. A
# desktop build going 1.5.40 -> 1.5.48 with no desktop commits in between is
# the intended reading: same app, newer backend contract.
#
# Usage:
#   scripts/sync-version.sh           # write the api version into every target
#   scripts/sync-version.sh --check   # report drift, write nothing, exit 1 if any
#
# Run by build-api.sh right after the bump, and by every build/deploy script
# before it packages anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/api/package.json"
CHECK=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

[ -f "$SOURCE" ] || { echo "!! no $SOURCE to read the version from" >&2; exit 1; }

# file<TAB>dot-path of the version key inside it
TARGETS=$(cat <<'EOT'
app/app.json	expo.version
app/package.json	version
desktop/package.json	version
desktop/shell/tauri.conf.json	version
desktop-electron/package.json	version
EOT
)

VERSION="$(node -p "require('$SOURCE').version")"
echo "==> version $VERSION (from api/package.json)"

DRIFT=0
while IFS=$'\t' read -r file path; do
  [ -n "$file" ] || continue
  full="$ROOT/$file"
  if [ ! -f "$full" ]; then
    printf '    %-32s missing, skipped\n' "$file"
    continue
  fi

  # Text replacement, NOT a JSON round-trip. desktop-electron/package.json
  # stores its em dash and (c) as \u2014 / \u00a9 escapes, and JSON.stringify
  # unescapes them — a rewrite there churned two unrelated lines. So JSON only
  # READS the current value; the write is a regex pinned to the key and to that
  # exact old value, and it refuses to fire unless it matches exactly once.
  changed="$(VERSION="$VERSION" DOTPATH="$path" CHECK="$CHECK" node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const parts = process.env.DOTPATH.split(".");
    const raw = fs.readFileSync(file, "utf8");
    let node = JSON.parse(raw);
    for (const key of parts.slice(0, -1)) {
      if (node[key] === undefined) { console.log("MISSING"); process.exit(0); }
      node = node[key];
    }
    const leaf = parts[parts.length - 1];
    const before = node[leaf];
    if (before === undefined) { console.log("MISSING"); process.exit(0); }
    if (before === process.env.VERSION) { console.log("OK"); process.exit(0); }
    if (process.env.CHECK !== "1") {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`("${esc(leaf)}"\\s*:\\s*)"${esc(before)}"`, "g");
      const hits = raw.match(re);
      if (!hits || hits.length !== 1) {
        console.log("AMBIGUOUS");
        process.exit(0);
      }
      fs.writeFileSync(file, raw.replace(re, `$1"${process.env.VERSION}"`));
    }
    console.log(before);
  ' "$full")"

  case "$changed" in
    OK)      printf '    %-32s already %s\n' "$file" "$VERSION" ;;
    MISSING)   printf '    %-32s !! no %s key\n' "$file" "$path"; DRIFT=1 ;;
    AMBIGUOUS) printf '    %-32s !! "%s" is not unique in the file, not touched\n' "$file" "${path##*.}"; DRIFT=1 ;;
    *)       printf '    %-32s %s -> %s\n' "$file" "$changed" "$VERSION"; DRIFT=1 ;;
  esac
done <<< "$TARGETS"

if [ "$CHECK" -eq 1 ] && [ "$DRIFT" -eq 1 ]; then
  echo
  echo "!! versions are out of step with the api. Run scripts/sync-version.sh," >&2
  echo "   then commit — a build ships the COMMITTED version, not this tree." >&2
  exit 1
fi

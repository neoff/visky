#!/usr/bin/env bash
# iOS harness, for the two surfaces that behave nothing alike.
#
# THE SIMULATOR TAKES NO SYNTHETIC TOUCHES. There is no `simctl tap`, and idb —
# the tool that could — is not installed here. So on `ios-sim` the ONLY way to
# move the app is a deep link, and the only thing to read back is a screenshot
# and the log. Every test case that needs a finger is marked `n/a` for that
# surface on purpose; it runs on the Android emulator and on the physical XS.
#
# THE PHYSICAL DEVICE takes no synthetic touches either, and it cannot even be
# screenshotted from here (devicectl has no such verb, and libimobiledevice is
# not installed). What it CAN do is install, launch with a console, and hand
# over files from the app container — which is enough to prove the state a case
# claims, with a human doing the tapping.
set -euo pipefail

SIM="${QA_SIM:-iPhone Xs}"
BUNDLE="${QA_BUNDLE:-com.envarg.visky}"
DEVICE_UDID="${QA_DEVICE_UDID:-6D60CF0D-BDF9-5288-B3A3-6C2EAC540E2A}"
ARTIFACTS="${QA_ARTIFACTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/artifacts}"

# ---------------------------------------------------------------- simulator
qa_ios_boot() {
  local state
  state="$(xcrun simctl list devices | grep -F "$SIM (" | head -1)"
  [ -n "$state" ] || { echo "!! no simulator named $SIM" >&2; return 1; }
  if ! printf '%s' "$state" | grep -q Booted; then
    echo "==> booting $SIM"
    xcrun simctl boot "$SIM"
    xcrun simctl bootstatus "$SIM" -b
  fi
  open -a Simulator
}

qa_ios_install() { # <path-to-.app>
  xcrun simctl install "$SIM" "$1"
}

qa_ios_launch() {
  xcrun simctl launch "$SIM" "$BUNDLE"
}

qa_ios_terminate() {
  xcrun simctl terminate "$SIM" "$BUNDLE" 2>/dev/null || true
}

# The only steering wheel this surface has.
qa_ios_deeplink() { # <visky://...>
  xcrun simctl openurl "$SIM" "$1"
}

qa_ios_screenshot() { # <name>
  mkdir -p "$ARTIFACTS/screenshots"
  xcrun simctl io "$SIM" screenshot "$ARTIFACTS/screenshots/ios-$1.png" >/dev/null
  echo "$ARTIFACTS/screenshots/ios-$1.png"
}

qa_ios_log() { # [pattern]
  local out="$ARTIFACTS/ios-sim.log"
  xcrun simctl spawn "$SIM" log show --last 2m --predicate "process == \"visky\"" > "$out" 2>/dev/null || true
  if [ $# -eq 0 ]; then cat "$out"; else grep -E "$1" "$out" || true; fi
}

# ------------------------------------------------------------ physical XS
qa_device_install() { # <path-to-.app>
  xcrun devicectl device install app --device "$DEVICE_UDID" "$1"
}

qa_device_launch() {
  xcrun devicectl device process launch --device "$DEVICE_UDID" --terminate-existing "$BUNDLE"
}

qa_device_running() {
  xcrun devicectl device info processes --device "$DEVICE_UDID" 2>/dev/null \
    | grep -c "visky.app/visky" || true
}

# Files out of the app's own container — the proof behind every "it was stored"
# claim on a surface where nothing can be tapped from here.
qa_device_pull() { # <source-in-container> <destination>
  xcrun devicectl device copy from --device "$DEVICE_UDID" \
    --domain-type appDataContainer --domain-identifier "$BUNDLE" \
    --source "$1" --destination "$2" >/dev/null
  echo "$2"
}

qa_device_crashes() { # [since-date]
  xcrun devicectl device info files --device "$DEVICE_UDID" \
    --domain-type systemCrashLogs --no-recurse 2>/dev/null | grep -i visky
}

#!/usr/bin/env bash
# Android emulator harness. Source it; every function is a verb the test cases
# in qa/TESTCASES.md are written in.
#
# The emulator is the surface that can do EVERYTHING — taps, swipes, screenshots
# and logs — which is why the cases that need a finger live here rather than on
# the iOS simulator (see qa/lib/ios.sh for why that one cannot).
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
AVD="${QA_AVD:-VK_API34}"
PKG="${QA_PKG:-com.envarg.visky}"
ACTIVITY="${QA_ACTIVITY:-$PKG/.MainActivity}"
ARTIFACTS="${QA_ARTIFACTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/artifacts}"

qa_android_boot() {
  if "$ADB" devices | grep -q "emulator-.*device$"; then
    echo "==> emulator already up"
    return 0
  fi
  echo "==> booting $AVD"
  "$EMULATOR" -avd "$AVD" -no-snapshot-save -no-boot-anim >"$ARTIFACTS/emulator.log" 2>&1 &
  "$ADB" wait-for-device
  # `wait-for-device` returns as soon as adb can talk to it, which is long
  # before the launcher exists. Anything installed in between is installed into
  # a half-booted system and silently fails to start.
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 2
  done
  "$ADB" shell input keyevent 82 >/dev/null 2>&1 || true
  echo "==> booted"
}

qa_android_install() { # <path-to-apk>
  echo "==> installing $1"
  "$ADB" install -r "$1"
}

qa_android_launch() {
  "$ADB" shell am start -n "$ACTIVITY" >/dev/null
}

qa_android_stop() {
  "$ADB" shell am force-stop "$PKG"
}

qa_android_deeplink() { # <visky://...>
  "$ADB" shell am start -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null
}

# The launch intent Assistant resolves for "open frisky music" — the spoken
# phrase itself needs a microphone, but what it RESOLVES TO is checkable.
qa_android_assistant_open() {
  "$ADB" shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$ACTIVITY"
}

qa_android_tap() { # <x> <y>
  "$ADB" shell input tap "$1" "$2"
}

qa_android_swipe() { # <x1> <y1> <x2> <y2> [ms]
  "$ADB" shell input swipe "$1" "$2" "$3" "$4" "${5:-300}"
}

qa_android_scroll_to_end() { # one screenful up, repeated
  local times="${1:-4}"
  for _ in $(seq 1 "$times"); do
    qa_android_swipe 540 1600 540 400 250
    sleep 1
  done
}

qa_android_pull_to_refresh() {
  qa_android_swipe 540 600 540 1700 400
}

qa_android_screenshot() { # <name>
  mkdir -p "$ARTIFACTS/screenshots"
  "$ADB" exec-out screencap -p > "$ARTIFACTS/screenshots/android-$1.png"
  echo "$ARTIFACTS/screenshots/android-$1.png"
}

qa_android_log_clear() { "$ADB" logcat -c; }

# ReactNativeJS is where console.log lands on Android — that is the channel
# every `==window` / `==prefetch` / `==recovery` line in the test cases arrives
# on, and grepping the whole buffer instead is how a run drowns.
qa_android_log() { # [grep-pattern]
  if [ $# -eq 0 ]; then
    "$ADB" logcat -d -s ReactNativeJS:V
  else
    "$ADB" logcat -d -s ReactNativeJS:V | grep -E "$1" || true
  fi
}

qa_android_await_log() { # <pattern> [timeout-seconds]
  local pattern="$1" timeout="${2:-30}" waited=0
  until qa_android_log "$pattern" | grep -q .; do
    sleep 1
    waited=$((waited + 1))
    [ "$waited" -lt "$timeout" ] || { echo "!! never saw: $pattern" >&2; return 1; }
  done
  qa_android_log "$pattern" | tail -1
}

# The played store, straight out of the app's sandbox. `run-as` works because
# these are debuggable builds; a release build would need a backup instead.
qa_android_pull_played() { # <destination>
  "$ADB" shell run-as "$PKG" cat files/mmkv/played 2>/dev/null > "$1" \
    || "$ADB" shell run-as "$PKG" cat /data/data/"$PKG"/files/mmkv/played > "$1"
  wc -c < "$1"
}

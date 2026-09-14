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
# Sourced from bash this resolves next to the harness; sourced from anything
# else — zsh has no BASH_SOURCE — it falls back to the repo layout rather than
# dying on an unset variable three lines into a test run.
if [ -n "${QA_ARTIFACTS:-}" ]; then
  ARTIFACTS="$QA_ARTIFACTS"
elif [ -n "${BASH_SOURCE+set}" ]; then
  ARTIFACTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/artifacts"
else
  ARTIFACTS="$PWD/qa/artifacts"
fi
mkdir -p "$ARTIFACTS"

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

# ---------------------------------------------------------------- tapping
#
# There is still no `simctl tap`. What there IS, since cliclick, is the ability
# to click the SIMULATOR WINDOW on the host — which the simulator delivers to
# the app as a real touch. That turns ios-sim from "screenshots only" into a
# surface that can be driven, and it is how the store frames are shot.
#
# The arithmetic is the fiddly part and it is done from measurements, not from
# guesses: the window reports its own position and size, the screenshot reports
# the device's pixel size, and the only constants are the 3x device scale and
# the window's title bar.

QA_IOS_TITLEBAR="${QA_IOS_TITLEBAR:-28}"

# Park the window at a known spot on the MAIN display before aiming anything.
#
# This is not tidiness. cliclick works in Quartz global coordinates and System
# Events reports AppleScript ones, and the two agree only on the main display —
# with the window parked on a second screen above it, every computed tap landed
# 1080 px away and looked exactly like a tap the app ignored. An hour went into
# that. Park first, then the arithmetic below is honest.
qa_ios_stage() {
  # Every OTHER simulator window is pushed aside first. Parking two windows at
  # the same spot is how a whole afternoon disappears: the clicks are aimed
  # correctly, they land on the window that happens to be in front, and the app
  # under test looks like it is ignoring input.
  osascript -e "
    tell application \"System Events\" to tell process \"Simulator\"
      repeat with w in windows
        if name of w does not start with \"$SIM\" then
          set position of w to {1400, 60}
        end if
      end repeat
      set target to first window whose name starts with \"$SIM\"
      set position of target to {${QA_IOS_WINDOW_X:-60}, ${QA_IOS_WINDOW_Y:-60}}
      perform action \"AXRaise\" of target
    end tell
  " >/dev/null 2>&1
}

# The screenshot's own pixel size. NOT divided by anything: the device scale is
# 3x on a phone and 2x on an iPad, and assuming one of them is how every tap on
# the iPad missed by a third of the screen.
qa_ios_screen_px() {
  local shot
  shot="$(mktemp -t viskyshot).png"
  xcrun simctl io "$SIM" screenshot "$shot" >/dev/null 2>&1
  local w h
  w="$(sips -g pixelWidth "$shot" | awk '/pixelWidth/{print $2}')"
  h="$(sips -g pixelHeight "$shot" | awk '/pixelHeight/{print $2}')"
  rm -f "$shot"
  echo "$w $h"
}

# Tap at a point given in SCREENSHOT PIXELS — the coordinates you read straight
# off the image you are looking at, with no scale to remember and no per-device
# arithmetic to get wrong.
#
# The mapping needs no device scale at all. The window's content area has the
# same aspect ratio as the screenshot, so its height (window height minus the
# title bar) and that ratio give its width, and whatever is left over is the
# padding on either side.
qa_ios_tap() { # <x-px> <y-px>
  local pixelX="$1" pixelY="$2"
  osascript -e 'tell application "Simulator" to activate' >/dev/null
  qa_ios_stage
  sleep 0.4

  local geometry winX winY winW winH shot shotW shotH
  geometry="$(osascript -e "
    tell application \"System Events\" to tell process \"Simulator\"
      set target to first window whose name starts with \"$SIM\"
      get {position, size} of target
    end tell
  ")"
  winX="$(echo "$geometry" | cut -d, -f1 | tr -d ' ')"
  winY="$(echo "$geometry" | cut -d, -f2 | tr -d ' ')"
  winW="$(echo "$geometry" | cut -d, -f3 | tr -d ' ')"
  winH="$(echo "$geometry" | cut -d, -f4 | tr -d ' ')"
  shot="$(qa_ios_screen_px)"
  shotW="$(echo "$shot" | cut -d' ' -f1)"
  shotH="$(echo "$shot" | cut -d' ' -f2)"

  local screen
  screen="$(python3 -c "
win_x, win_y, win_w, win_h = $winX, $winY, $winW, $winH
shot_w, shot_h = $shotW, $shotH
content_h = win_h - $QA_IOS_TITLEBAR
content_w = content_h * (shot_w / shot_h)
pad_x = (win_w - content_w) / 2
print(f'{round(win_x + pad_x + content_w * $pixelX / shot_w)},{round(win_y + $QA_IOS_TITLEBAR + content_h * $pixelY / shot_h)}')
")"

  [ -n "${QA_TAP_DEBUG:-}" ] && echo "tap ${pixelX},${pixelY}px of ${shotW}x${shotH} -> ${screen} (window $winX,$winY ${winW}x${winH})" >&2
  cliclick "c:${screen}"
}

# Drag, for the gestures a tap cannot stand in for — dismissing a modal that
# only closes by swipe, and pull-to-refresh. Screenshot pixels, same as above.
# cliclick does press, move and release as separate verbs, and the intermediate
# moves are what make the simulator read it as a drag rather than a teleport.
qa_ios_swipe() { # <x1-px> <y1-px> <x2-px> <y2-px> [steps]
  local fromX="$1" fromY="$2" toX="$3" toY="$4" steps="${5:-12}"
  osascript -e 'tell application "Simulator" to activate' >/dev/null
  qa_ios_stage
  sleep 0.4

  local geometry winX winY winW winH shot shotW shotH
  geometry="$(osascript -e "
    tell application \"System Events\" to tell process \"Simulator\"
      set target to first window whose name starts with \"$SIM\"
      get {position, size} of target
    end tell
  ")"
  winX="$(echo "$geometry" | cut -d, -f1 | tr -d ' ')"
  winY="$(echo "$geometry" | cut -d, -f2 | tr -d ' ')"
  winW="$(echo "$geometry" | cut -d, -f3 | tr -d ' ')"
  winH="$(echo "$geometry" | cut -d, -f4 | tr -d ' ')"
  shot="$(qa_ios_screen_px)"
  shotW="$(echo "$shot" | cut -d' ' -f1)"
  shotH="$(echo "$shot" | cut -d' ' -f2)"

  local plan down moves up
  plan="$(python3 -c "
win_x, win_y, win_w, win_h = $winX, $winY, $winW, $winH
shot_w, shot_h = $shotW, $shotH
content_h = win_h - $QA_IOS_TITLEBAR
content_w = content_h * (shot_w / shot_h)
pad_x = (win_w - content_w) / 2
def screen(px, py):
    return round(win_x + pad_x + content_w * px / shot_w), round(win_y + $QA_IOS_TITLEBAR + content_h * py / shot_h)
steps = $steps
moves = []
for i in range(steps + 1):
    t = i / steps
    moves.append('m:%d,%d' % screen($fromX + ($toX - $fromX) * t, $fromY + ($toY - $fromY) * t))
print('dd:%d,%d' % screen($fromX, $fromY))
print(' '.join(moves))
print('du:%d,%d' % screen($toX, $toY))
")"
  down="$(echo "$plan" | sed -n 1p)"
  moves="$(echo "$plan" | sed -n 2p)"
  up="$(echo "$plan" | sed -n 3p)"
  cliclick -w 20 "$down" $moves "$up"
}

# The system asks "Open in visky?" for every custom-scheme url opened from
# outside, and the alert takes a tap. Its default button sits in the same place
# on every device, proportionally, so the deep link and the confirmation are
# one verb here rather than two.
qa_ios_open() { # <visky://...>
  qa_ios_deeplink "$1"
  sleep 3
  local shot shotW shotH
  shot="$(qa_ios_screen_px)"
  shotW="$(echo "$shot" | cut -d' ' -f1)"
  shotH="$(echo "$shot" | cut -d' ' -f2)"
  # "Open" is the right-hand button of a centred two-button alert.
  qa_ios_tap "$((shotW * 68 / 100))" "$((shotH * 545 / 1000))"
  sleep 3
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

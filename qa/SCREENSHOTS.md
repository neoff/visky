# Store screenshots — what each store actually requires

Both listings are filled from the same six frames, shot on whichever surface can
produce the required pixel size. The frames are chosen to answer the question a
browsing stranger is actually asking — "what is this, and what will it look like
in my hand" — not to show every screen the app has.

## The six frames

| id | screen | why it earns a slot |
|----|--------|---------------------|
| 1 | Songs, scrolled to a dense part of the archive | the product IS the archive; an empty list sells nothing |
| 2 | The full player, artwork and progress | the one screen people live in |
| 3 | Songs with the mini player docked and playing | shows the app keeps playing while you browse |
| 4 | Favorites with a few hearts set | says the library is yours, not a radio dial |
| 5 | Search with results | answers "can I find the set I remember" |
| 6 | The device picker, mid-transfer | the feature nothing else in this category has |

Never ship a frame containing: a spinner, an empty list, a debug banner, the
Metro dev overlay, a half-loaded image, or a track title that is a raw VK filename.
Re-shoot instead — a screenshot is the only part of the listing most people read.

## App Store (apps 6808513521)

* **6.9" iPhone — REQUIRED.** 1320 × 2868 portrait. Simulator `visky-shot-69`
  (iPhone 17 Pro Max, iOS 26.5), created for exactly this.
* 6.5" / 5.5" — no longer required; Apple derives the smaller sizes from the
  6.9" set. Do not spend time on them.
* **iPad 13" — required only while the listing offers iPad.** `app.json` has
  `ios.supportsTablet: true`, so the app IS offered there and the iPad set is
  not optional. Either shoot it (simulator `iPad Pro 13-inch`) or drop iPad from
  the listing — those are the only two honest options.
* Up to 10 per size, first 3 are what the store actually shows in search.

## Google Play (com.envarg.visky)

* **Phone — 2 to 8, required.** 16:9 or 9:16, each side 320–3840 px. The
  Android emulator's own 1080 × 2400 is inside that and needs no scaling.
* **Feature graphic — 1024 × 500, required, and it is not a screenshot.** A
  designed banner with the app name. Nothing here produces it; it has to be
  made once and reused.
* 7" and 10" tablet sets — only if the listing claims tablet support.

## How they are taken

    # iOS, 6.9"
    xcrun simctl boot visky-shot-69
    xcrun simctl install visky-shot-69 <path>/visky.app
    xcrun simctl openurl visky-shot-69 "visky:///"      # and the other routes
    xcrun simctl io visky-shot-69 screenshot qa/artifacts/screenshots/store-ios-1.png

    # Android
    source qa/lib/android.sh
    qa_android_screenshot store-android-1

The simulator takes no synthetic touches (see `qa/lib/ios.sh`), so every iOS
frame has to be reachable by a deep link — `visky:///`, `visky:///player`,
`visky:///favorites`. A frame that needs a tap is shot on the Android emulator,
or on the physical phone by a human.

**Both surfaces need a signed-in app first.** A fresh simulator has no session,
and VK will not let one be created there — that is the whole reason the pairing
flow exists. Open `visky:///pair` on the simulator, then approve it from a phone
that is already signed in (Settings → Add a device). Until that is done, every
frame is an empty list and none of them are usable.

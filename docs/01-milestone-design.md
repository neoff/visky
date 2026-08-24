# 01 — Design parity (iOS ⇄ Android) + playlist sorting milestone

Full record of the UI-parity pass and the backend sorting fix, so the work can be resumed.
Written 2026-08-24.

Baseline: side-by-side screenshots of Samsung Galaxy S21+ (Android) and iPhone simulator
(iOS 26.1) on the player screen, the songs list, and the scrolled songs list.

---

## Goal

1. **App:** iOS and Android must render the *same* layout — same font sizes, same paddings,
   same control positions, same surfaces. Plus four concrete visual bugs:
   1. the ▶ overlay in the track list is not centred on the artwork thumbnail,
   2. the bottom tab icons are invisible except the active one,
   3. the bars/plates ("плашки") have different opacity between the platforms,
   4. the mini player floats in mid-air instead of sitting directly on top of the tab bar.
2. **API:** multipart shows must come back ordered `Part 1 → Part 2 → Part 3`, and the
   `FRISKY | ` prefix must be stripped. VK now returns a **new title format**, which is what
   broke the old sorting.

---

## Part A — API: cleanup + Part sorting

### Root cause

VK changed the payload shape. Both formats are now in flight:

| | artist | title |
|---|---|---|
| old | `FRISKY \| Blue` | `Event 2024 - Mix (Part 2) [vk.com/feelin_frisky]` |
| new | `Melamanos` | `FRISKY \| Artist of the Week August 2026 - Part 2` |

Two things broke at once:

1. **`FRISKY | ` moved from `artist` into `title`.** `cleanupData` only stripped it from
   `artist`, so it survived in the title and reached the app (see the screenshots:
   `FRISKY | SEVENTEEN Part 2`).
2. **The part suffix changed spelling**: `(Part N)` → `- Part N`. The sort regex was
   `/^(.*)\s+\(Part (\d+)\)$/i`, which requires the parentheses — the new titles never matched,
   so no grouping happened and the tracks stayed in VK's date-descending order, i.e. Part 2
   before Part 1.

### Fix — `api/src/helper/index.ts`

**Old rules were kept**, as requested; the new spellings were added alongside them.

```ts
const friskyPrefixRegex = /^\s*FRISKY\s*\|\s*/i
const partRegex = /^(.*?)\s*(?:[-–—]\s*)?\(?\s*Part\s+(\d+)\s*\)?$/i
```

* `friskyPrefixRegex` — case-insensitive, tolerant of the spacing around the pipe. Applied to
  **both** `artist` and `title`.
* `partRegex` — matches every spelling seen so far:
  `Mix (Part 1)`, `Artist of the Week - Part 1`, `SEVENTEEN Part 2` (en/em dashes included).
  The base title is captured lazily so the trailing separator is not glued onto it.

`cleanupData` order of operations (unchanged rules marked *old*):

1. strip `FRISKY | ` from `artist` *(old, now regex-based)*
2. strip `FRISKY | ` from `title` **(new)**
3. strip the `Month YYYY - ` prefix `/\w+? \d{4} - /g` *(old)*
4. strip ` [vk.com/feelin_frisky]` *(old)*
5. `trim()` **(new — the date strip can leave a leading/trailing space)**

`sortLocalPartTracks` was rewritten from an *adjacent-block* scan to a **grouping pass**:

* every part-looking item is keyed by its lowercased base title into a `Map`;
* the group is placed at the position of its **first** member, so the playlist's overall
  date-descending order is preserved;
* inside a group, items are sorted numerically by part number.

Why this is stronger than before: the old code only merged parts that were **already adjacent**.
If VK ever interleaves two shows, or a page boundary splits them, the parts still group correctly
now.

### Worked example

Input (VK order, newest first):

```
FRISKY | Artist of the Week August 2026 - Part 2
FRISKY | Artist of the Week August 2026 - Part 1
```

Output:

```
Artist of the Week Part 1
Artist of the Week Part 2
```

### Tests

`api/src/__tests__/helper/index.test.ts` — three new cases added, old ones untouched:

* `cleanupData` strips `FRISKY | ` from a new-format title,
* `sortLocalPartTracks` orders `- Part N` blocks,
* `cleanupDataAndSortPart` handles a full new-shape payload with two interleaved shows and a
  three-part show.

`npx jest` → **8 suites, 55 tests, all green.**

---

## Part B — App: iOS ⇄ Android parity

### B0. Root cause of the global divergence — `modifiers`

`app/src/constants/index.ts` carried a per-platform fudge table that was added to almost every
size in `src/styles/index.ts`:

```ts
text: ios ? 0 : 8,  icons: ios ? 0 : 8,  padding: ios ? 0 : 5,
margin: ios ? 0 : 25, image: ios ? 0 : 20, scroll: ios ? 0 : 60, …
size.base: ios ? 0 : 18, size.image: ios ? 0 : 50
```

So Android systematically got **+8 px fonts, +8 px icons, +20 px artwork, +25 px separator
margins** — that is the "different font size / different spacing" in the screenshots, by design.

**Fix:** every modifier is now `0` on both platforms. The keys are kept (all the
`20 + modifiers.icons` call sites keep compiling) with a comment explaining that the table must
stay zeroed. Real platform differences are now handled where they belong — via
`useSafeAreaInsets()`.

New shared metrics in the same file:

```ts
export const layout = {
  tabBarContentHeight: 60,   // tab bar height WITHOUT the bottom safe-area inset
  tabBarRadius: 20,
  headerContentHeight: 130,  // search header height WITHOUT the top inset
}
```

and a shared surface colour `colors.surface = '#252525'`.

### B1. ▶ icon not centred on the artwork *(bug 1)*

`trackPlayingIconIndicator` / `trackPausedIndicator` were absolutely positioned with hardcoded
`top: 14/18, left: 14/16`, ignoring the artwork's own `marginLeft: 10` **and** the fact that the
artwork is 50 px on iOS but was 70 px on Android (`+ modifiers.image`). The icon could never be
centred on both.

**Fix** (`src/styles/index.ts`, `src/components/TrackListItem.tsx`): the artwork is wrapped in a
sized container and the indicator became a **centred absolute-fill overlay**:

```
trackArtworkContainer  – width/height 50, marginLeft 10   (owns the offset)
  trackArtworkImage    – width/height 100%
  trackArtworkOverlay  – position absolute, 0/0/0/0, center/center  (▶ or spinner)
```

The overlay is `pointerEvents="none"` so the row press target is unchanged. Centring is now
size-independent: change the thumbnail size and the icon follows.

### B2. Invisible inactive tab icons *(bug 2)*

`tabBarActiveTintColor` was set, `tabBarInactiveTintColor` was **not** — React Navigation fell
back to its default grey, which is unreadable on the dark blurred bar. Only the active (red) item
was visible.

**Fix:** `tabBarInactiveTintColor: colors.textMuted` (`#9ca3af`).

### B3. Plates with different opacity *(bug 3)*

Three surfaces used `expo-blur`:

* the tab bar (`BlurView intensity=95 tint=dark experimentalBlurMethod="dimezisBlurView"`),
* the animated search header (same),
* while the mini player used a **solid** `#252525`.

`expo-blur` on Android uses the Dimezis backport and does not match iOS's native
`UIBlurEffect` — same `intensity`, visibly different translucency. Mixing that with an opaque
mini player gave three different opacities in one screen.

**Fix (revised — see "Round 2" below):** blur removed from the tab bar and the search header, but
the plates stay **translucent**: they are painted with explicit rgba colours
(`colors.surface = rgba(32,32,32,0.82)`, `colors.surfaceHeader = rgba(10,10,10,0.82)`) instead of a
BlurView. Same see-through look, identical on both platforms, no Dimezis backport involved. The
rounded top corners of the tab bar are preserved (`layout.tabBarRadius`, `overflow: 'hidden'`).

### B4. Mini player floating in mid-air *(bug 4)*

The tab bar height was `size.base + 78` (78 iOS / 96 Android) with `paddingBottom: 30`, while the
mini player was pinned at `bottom: insets.bottom + 96` with `left/right: 8`. The two numbers were
unrelated, so the gap was wrong on both platforms and differently wrong on each.

**Fix** — one number drives both, in `src/app/(app)/(tabs)/_layout.tsx`:

```ts
const tabBarHeight = layout.tabBarContentHeight + bottom   // 60 + real inset
// tab bar: height = tabBarHeight, paddingBottom = bottom, bottom = 0
// mini player: bottom = tabBarHeight, left = 0, right = 0
```

The mini player is therefore **docked exactly on top of the tab bar** on both platforms. Its
style was updated to match: full-bleed (`left/right: 0`), `colors.surface`, and only the **top**
corners rounded (`borderTopLeft/RightRadius: 12`) so there is no seam against the bar below.
Its title switched from a hardcoded `fontSize: 18` to the shared `fonts.sm`.

Note: the tab bar no longer hardcodes `paddingBottom: 30` — it uses the real bottom inset, so the
home-indicator gap is correct on gesture-nav Android and on iPhones alike.

### B5. Search header / list offset

`AnimatedSearchHeader` had `paddingTop: 60` hardcoded, and the songs screen compensated for the
Android difference with `HEADER_HEIGHT = 130 + modifiers.scroll` (i.e. `+60` on Android only).

**Fix:**

* header: `paddingTop = insets.top + 8`, solid background;
* songs screen: `HEADER_HEIGHT = layout.headerContentHeight + insets.top`;
* `contentInsetAdjustmentBehavior` changed `"automatic"` → `"never"` — the list is padded
  manually by `HEADER_HEIGHT`, and letting iOS add its own content inset on top of that was a
  second, iOS-only offset.

### B6. List bottom padding

`TrackList` / `PlayList` hardcoded `paddingBottom: 128`. Now
`layout.tabBarContentHeight + 80`, so the last row always clears the tab bar **and** the docked
mini player, and it stays correct if the tab bar height is ever changed in one place.

---

## Files touched

**API**

* `api/src/helper/index.ts` — `friskyPrefixRegex`, `partRegex`, `cleanupData`,
  `sortLocalPartTracks` (regrouping rewrite).
* `api/src/__tests__/helper/index.test.ts` — 3 new cases.

**App**

* `app/src/constants/index.ts` — `colors.surface`, zeroed `modifiers`/`size`, new `layout`.
* `app/src/styles/index.ts` — `trackArtworkContainer` / `trackArtworkOverlay` /
  `trackArtworkImage` replace the two hardcoded indicator styles.
* `app/src/components/TrackListItem.tsx` — artwork wrapper + centred overlay.
* `app/src/app/(app)/(tabs)/_layout.tsx` — inactive tint, solid bar, inset-driven height,
  docked mini player.
* `app/src/components/FloatingPlayer.tsx` — shared surface colour, full-bleed, top-rounded,
  shared font token.
* `app/src/components/AnimatedSearchHeader.tsx` — solid background, inset-driven top padding.
* `app/src/app/(app)/(tabs)/(songs)/index.tsx` — inset-driven `HEADER_HEIGHT`,
  `contentInsetAdjustmentBehavior="never"`.
* `app/src/components/TrackList.tsx`, `app/src/components/PlayList.tsx` — bottom padding from
  `layout`.

---

## Verification

* `cd api && npx jest` → 8 suites / 55 tests green.
* `cd app && npx tsc --noEmit` → only the **2 pre-existing** errors (`MovingText.tsx:56`
  reanimated `StyleProps`, `TrackShortcutsMenu.tsx:43` router path). Verified against a stashed
  tree: the same 2 errors, no new ones.
* Visual check on both simulators — **done**, see "Round 2".

---

## Rules to keep (do not regress)

1. **`modifiers` stays all-zero.** Any platform difference goes through `useSafeAreaInsets()` or
   an explicit, commented `Platform.select` — never a blanket `+8 px on Android`.
2. **No `BlurView` on shared chrome** (tab bar, header, mini player) until iOS/Android render it
   identically. Translucent rgba (`colors.surface` / `colors.surfaceHeader`) instead — translucency
   is kept, only the blur is gone.
3. **The tab bar height lives in exactly one expression** (`layout.tabBarContentHeight + bottom`).
   The mini player and the list padding derive from it; never hardcode a second number.
4. **Overlays centre by absolute-fill + flex centring**, never by hardcoded `top`/`left`.
5. **The API keeps both title formats.** Old shows are still served with the old shape — when a
   third format appears, extend the regexes, do not replace them.

---

## Open / next

* Run both simulators and diff the three screens again (player, songs, scrolled songs).
* The new VK payload has **no `album.thumb`**, so `artwork` is `undefined` and every row shows the
  placeholder note icon (visible in all screenshots). Not in scope here; needs either a separate
  `audio.getById`/album lookup or a show-artwork fallback.
* `favorites` / `artists` screens still use the native `useNavigationSearch` header, not
  `AnimatedSearchHeader` — they were left alone and will look different from `songs` until they
  are migrated.


---

# Round 2 — after the first visual check on both devices

Screenshots were taken straight off the running devices (no manual work needed):

```bash
# iOS simulator
xcrun simctl io booted screenshot out.png
# Android emulator
~/Library/Android/sdk/platform-tools/adb exec-out screencap -p > out.png
# Android input (pull to refresh, relaunch)
adb shell input swipe 540 700 540 2000 450
adb shell monkey -p com.envarg.visky -c android.intent.category.LAUNCHER 1
```

iOS touch injection is **not** available (`simctl` has no tap/swipe, and `osascript` lacks
assistive access here), so iOS-side gestures still have to be done by hand.

## R2.1 — THE root cause of "different font size" was the emulator, not the code

```
adb shell wm size      → 1080x2400
adb shell wm density   → 320          →  1080/2 = 540dp logical width
iOS simulator                          →  402pt logical width
```

The Android emulator was configured at **density 320 on a 1080p panel**, i.e. a 540 × 1200 **dp**
canvas — 1.34× wider in dp than the iPhone. Every dp-based size (a 50dp thumbnail, a 16sp label)
therefore occupies ~35 % less of the screen on Android. **That is what the old `modifiers` table
was really compensating for** (`+8` font, `+20` artwork …): it was a fudge for a mis-configured
emulator, and it broke the moment the app ran on a correctly configured device.

A real Galaxy S21+ is 1440 × 3200 @ 560 dpi → 411dp wide. Matching that on the 1080p emulator
means density ≈ 420:

```bash
adb shell wm density 420     # 1080/2.625 = 411dp — matches a real S21+
adb shell wm density reset   # back to the emulator default (320)
```

After the override the two devices render the **same number of rows at the same proportions**, with
`modifiers` all zero. Conclusion: keep the code density-independent and fix the *device* profile;
never re-add per-platform pixel fudges.

## R2.2 — plates lost their transparency

Round 1 replaced BlurView with a fully opaque `#252525`, which killed the see-through look.
Fixed by keeping the blur removed but making the plates translucent with plain rgba
(`colors.surface`, `colors.surfaceHeader`). rgba is composited identically by both platforms, so
this keeps parity *and* transparency.

## R2.3 — icon sizes and label weights

* Tab icons were `20 / 24 / 20 / 28` — four different glyph heights in one row. All four now use
  `layout.tabIconSize` (24), plus a fixed `tabBarIconStyle` box so every label sits on the same
  baseline.
* `fonts.weight` was still platform-dependent (`ios ? 500 : 600`). A heavier weight renders visibly
  larger on Android → pinned to **600** on both.
* Explicit `lineHeight` on the mini-player title, the header title and the tab labels: the default
  line height is font-dependent and differs per platform.

## R2.4 — mini player and the plates had different heights

The mini player's height came out of `padding + artwork + text line height`, so it drifted with the
platform font metrics. It now has a **fixed** `height: layout.floatingPlayerHeight` (60), the same
number the tab bar plate uses (`layout.tabBarContentHeight`).

## R2.5 — the Android search row was cut in half

`searchBox` had `height: 48` **and** `paddingVertical: 8`, while the `TextInput` inside added its
own `paddingVertical: 10` plus Android's `includeFontPadding`. Content needed ~41px inside a 32px
box; Android clips, iOS overflows — so only Android showed a sliced row.

Fix: the box keeps its fixed height and drops the vertical padding; the input is `height: '100%'`,
`paddingVertical: 0`, `textAlignVertical: 'center'`, `includeFontPadding: false`.

## R2.6 — the cleaned titles never reached the screen (client-side cache)

Even after the API was fixed, the device still showed `FRISKY | …`. The sort order **did** change,
which proved the new API code was live — only the text was stale.

Cause, `app/src/helpers/miscellaneous.ts`:

```ts
reducer([...freshFromApi, ...cachedTracks])
// (acc, curr) => acc.set(curr.id, {...acc.get(curr.id), ...curr})   // LAST wins
```

The cached copy is passed last, so for every track already in MMKV the **stale cached title
overwrote the freshly cleaned one**. Renames on the API could never appear.

Fix: `{...curr, ...acc.get(curr.id)}` — **first occurrence wins**, and since every caller passes
fresh data first, the server is authoritative. The Map's insertion order (= the API's Part 1 → Part 2
order) is unchanged.

Verified on the Android device after a pull-to-refresh: `SEVENTEEN Part 1`, `SEVENTEEN Part 2` —
prefix gone, order right. iOS carries its own MMKV cache and needs **one pull-to-refresh** to pick
the change up (its queue-loaded mini player keeps the old title until the next play).

## R2.7 — files touched in round 2

* `app/src/constants/index.ts` — rgba `surface` / `surfaceHeader`, `fonts.weight: 600`,
  `layout.floatingPlayerHeight` / `tabIconSize` / `searchBoxHeight`.
* `app/src/app/(app)/(tabs)/_layout.tsx` — one icon size, fixed icon box, label line height.
* `app/src/components/FloatingPlayer.tsx` — fixed height, explicit line height.
* `app/src/components/AnimatedSearchHeader.tsx` — un-clipped input, translucent plate, title line height.
* `app/src/helpers/miscellaneous.ts` — `reducer` merge direction.

## R2.8 — environment notes

* The Android emulator density is currently overridden to **420** (`adb shell wm density reset`
  reverts it).
* `tsx watch` did **not** pick up the `api/src/helper/index.ts` change — the child process was older
  than the edit. `touch api/src/index.ts` forces a respawn; check with
  `ps -o lstart= -p $(lsof -ti :3000)` before concluding that an API change is live.


---

# Round 3 — track identity, paddings, player artifacts

## R3.1 — PROCESS: deployed too early (my mistake)

I shipped before everything was verified: `varg/visky-api:1.5.28` went to the cluster and an EAS
Android build was started with `--auto-submit` to Google Play while the iOS side was unverified and
three real bugs were still live.

The EAS build (`599c1cb9-f096-4a18-8b1f-56055a09e449`, versionCode 51) was **canceled** in flight;
`eas submit:list` is empty, so **nothing reached Google Play**. The API rollout did happen and is
still live (see open questions for the rollback option).

**Rule from now on:** verify every item on every platform → report → ask → only then deploy. Anything
that cannot be verified is a hard blocker for shipping, not a footnote.

## R3.2 — Root cause of three bugs at once: track identity by `url`

`TrackListItem`, `TrackList`, `TrackShortcutsMenu` and `store/library` all compared tracks with
`a.url === b.url`. VK hands out **signed m3u8 links that are regenerated on every `audio.get`**, so
after any refresh the list holds different urls than the queue inside the player. Consequences,
all three reported:

* **no highlight on the tapped row** — `useActiveTrack()?.url === track.url` never matched again;
* **the ▶ overlay disappeared** — it is rendered under the same `isActiveTrack` condition;
* **a different track played** — `TrackList` kept its own `queueOffset` ref and did index
  arithmetic (`trackIndex - queueOffset.current`) against the on-screen list. The ref is re-created
  whenever `TrackList` remounts while `activeQueueId` lives in a zustand store that survives, and a
  refresh can reorder the list without changing the queue id — so the arithmetic pointed at the
  wrong queue slot.

**Fix**

* `helpers/miscellaneous.ts` gains `trackKey()` / `isSameTrack()` — identity is the track **id**,
  falling back to url only when there is no id. Every comparison site now uses it.
* `TrackList.handleTrackSelect` no longer does arithmetic. It asks the player for its real queue
  (`TrackPlayer.getQueue()`), finds the track by id and `skip()`s to that exact index; it rebuilds
  the queue only when the list is a different one or the track is not queued. `queueOffset` is gone.

Verified on the Android emulator: tapping the "At Play August 2026 / Hakuna" row highlights **that**
row and plays **that** track; a paused active row shows the ▶ overlay centred on the artwork.

## R3.3 — side paddings halved

`screenPadding.horizontal` 24 → **12**, and the row itself no longer adds asymmetric padding of its
own (it had `marginLeft: 10` on the artwork and `paddingRight: 20` for the "…" menu, i.e. 34 left
vs 44 right in total). The row is now flush with the screen padding on both sides, and the item
separator starts at the text (`artwork width + columnGap`) instead of a hardcoded 60.

## R3.4 — artifacts when the mini player is expanded (mitigated, NOT reproduced)

Could not be reproduced: opening the player through a deep link
(`xcrun simctl openurl booted visky:///player`) renders a clean screen on iOS, and tapping the mini
player on Android does too. The report came from the **vertical dismiss gesture**, which cannot be
injected into the iOS simulator here.

Mitigation applied on the plausible cause: the stack had no opaque content background, so during the
gesture the card is composited over the tabs screen — and the tab bar / mini player are **translucent
now**, which is exactly the kind of grey rectangle in the screenshot. `app/(app)/_layout.tsx` now
pins `contentStyle: {backgroundColor: colors.background}` on the stack and on the player screen.

**Needs a human check with the actual swipe gesture on iOS.**

## R3.5 — files touched in round 3

* `app/src/helpers/miscellaneous.ts` — `trackKey` / `isSameTrack`.
* `app/src/components/TrackList.tsx` — queue-accurate selection, `queueOffset` removed.
* `app/src/components/TrackListItem.tsx`, `TrackShortcutsMenu.tsx`, `src/store/library.tsx` —
  identity by id.
* `app/src/constants/index.ts` — `screenPadding.horizontal: 12`.
* `app/src/styles/index.ts` — symmetric row padding, separator offset.
* `app/src/app/(app)/_layout.tsx` — opaque stack content background.


---

# Round 4 — the two gaps beside the tab bar

With the mini player docked on it, the tab bar's rounded top corners
(`layout.tabBarRadius`, 20) left a small notch on each side where the list showed through between
the two plates — the mini player's bottom edge is square, the bar's top edge is not.

**Fix** (`app/src/app/(app)/(tabs)/_layout.tsx`): the radius is now conditional. The layout watches
the same condition `FloatingPlayer` bails out on (`useActiveTrack() ?? useLastActiveTrack()`); while
the mini player is on screen the bar's top corners are square, so the two plates read as one block.
With no track loaded the tab bar keeps its rounded corners.

Verified on both devices by cropping the strip where the plates meet: no gaps left or right.


---

# Round 5 — pause glyph instead of the spinner (open question 4, answered)

`TrackListItem` rendered `playing ? <ActivityIndicator/> : <Ionicons play/>`, so a **playing** track
showed a loading spinner. `useIsPlaying()` also returns `bufferingDuringPlay`, which is what the
spinner actually belongs to.

Now: `bufferingDuringPlay` → spinner, `playing` → `pause` glyph, otherwise → `play` glyph.

Verified on the Android emulator, both states: playing row shows ‖ centred on the artwork, pausing
from the mini player switches the same row to ▶.


---

# Round 6 — divider between the mini player and the tab icons

The docked plate read as one block, so the two sections needed a seam. It is a **painted hairline,
never a gap**: a transparent line would punch a hole through both translucent plates and show the
list underneath.

`FloatingPlayer` renders an absolutely positioned `View` on its bottom edge, coloured
`colors.surfaceDivider`.

Three takes to land it:
1. dark hairline on a lighter plate — invisible; `StyleSheet.hairlineWidth` is 0.33pt on a 3x screen;
2. swapping the two colours made the line read, but the plate inherited the 0.55 alpha and went
   nearly see-through;
3. **final:** the plate keeps its own value (`rgba(32,32,32,0.82)`) and the divider is *lighter*
   than it — `rgba(255,255,255,0.22)` at **2px**. It is translucent white composited ON the plate,
   so it brightens the plate rather than cutting through it; the list never shows through.
Its width spans the mini player's own content: from the **left edge of the artwork** (`left: 8`, the
plate's `paddingHorizontal`) to the **right edge of the ⏭ button** (`right: 8 + 16`, the plate
padding plus `trackControlsContainer.marginRight`). Absolute children are positioned against the
parent's border box, so the parent's padding has to be repeated in these numbers.

Verified on both devices with a 1:1 crop of the seam.


---

# Round 7 — the welcome (login) screen

Copy and artwork rewrite of `app/src/app/(auth)/welcome.tsx`:

* the FontAwesome `user-circle` placeholder is replaced by the **app logo**. `assets/icon.png` was
  copied verbatim to `assets/logo.png` (no crop, as asked) — it is a 1024x1024 PNG with transparent
  corners, so it needs an opaque plate under it. The plate is a **circle**, 112pt across, just over
  the 100pt person icon it replaced, and the artwork fills 96% of it so the arms of the X almost
  touch the border instead of floating in white.
* `Welcome Stranger!` → **`Welcome to the dawn.`**, with the long blurb under it a step smaller than
  the body text (`fonts.xs`) so the header keeps the weight.
* a **right-aligned italic quote** in quotation marks under the logo.
* the old `Please log in to continue…` is merged with the "now experience" line into one block.

The screen scrolls now (`ScrollView`): the copy is long enough to overflow a small phone.

**Logo sizing, as iterated on screen.** The plate started at 200pt with the artwork at 140 (sized so
the corners of the square PNG could not be clipped by the radius) — too much white ring, because the
X inside the PNG only spans ~90% of it. Raising the artwork to 192/200 put the arms almost on the
border with no visible clipping, and that 96% ratio was then kept while the circle shrank twice:
200 → 150 → **112pt**, which lands just over the 100pt person icon it replaced. Artwork 108pt.

**Line breaks are explicit.** Every paragraph break the copy needs is a hard `{'\n'}`, not a
reflow, so the text reads the same on both platforms:

```
You've just accessed the beautiful experience.
This experience will cover courtship, sex, commitment, fetishes, loneliness, vindication, love, and hate.
Please enjoy your experience.
...
Please log in to continue.
You've just accessed the now experience.
This experience is great for dancing
and improving self-esteem.
```

The long "courtship…" line still wraps on its own — it is wider than either screen — but the forced
breaks sit exactly where they were asked for.

Verified on both devices by opening `visky:///welcome` — `xcrun simctl openurl` on iOS and
`adb shell am start -a android.intent.action.VIEW -d visky:///welcome` on Android, which is how to
reach an auth screen while a session exists.


---

# Release — 2026-08-24

**Pushed:** `c7b7854..518b74d` to `origin/main` (25 commits: the API fix, the parity work, rounds
3–7).

**Backend: NOT redeployed.** `git diff --name-only e105acc..HEAD -- api/` is empty — everything after
the 1.5.28 release commit is app-side or docs. `varg/visky-api:1.5.28` is still the live image
(pod Running, `https://visky.envarg.com/health` → 200).

**Android:** `scripts/build-app.sh` → EAS profile `production`, `--auto-submit` to Google Play
(internal track). versionCode auto-incremented 51 → **52** (`appVersionSource: remote`).

* build: https://expo.dev/accounts/varg/projects/visky/builds/a8ce5b8e-ebf6-4a25-a71c-d66eea6ab5ac
* submission: https://expo.dev/accounts/varg/projects/visky/submissions/d464fb76-0921-4201-b7b5-ee7590843f9a

Note for the record: this shipped with open question 2b still open — tap-to-play and the pause glyph
were never exercised **by hand on iOS**, only on Android, because touch cannot be injected into the
iOS simulator here. The user was told twice and ordered the build anyway. It does not affect the
Android artifact, which is the one being shipped.

---

# OPEN QUESTIONS — need your decision / your hands

1. ~~**iOS: the mini-player expand gesture.**~~ **RESOLVED** — confirmed by the user on 2026-08-24:
   the grey rectangles are gone with the opaque `contentStyle` on the stack.

2. ~~**api 1.5.28 rollback?**~~ **RESOLVED — keep 1.5.28.** The rollback offer was about the process
   (it shipped before verification), not about the code: 1.5.28 is verified (55 tests green, prefix
   stripped and Part 1 before Part 2 on device), so rolling back would restore the bug.

2b. **Still unverified on iOS** (no touch injection here, see round 3): tap-to-play picking the
   right track, and the new pause glyph on the active row. Both are platform-agnostic code paths
   verified on Android, but nobody has tapped them on iOS. **The user shipped the Android build
   anyway on 2026-08-24 knowing this** — it stays open for whenever the iOS build is cut.

3. **The mini player shows a stale title** (`FRISKY | At Play August 2026`) while the list shows the
   cleaned one. The queue inside `react-native-track-player` still holds the objects it was built
   from; it is only rebuilt when the list id changes. Options: (a) leave it — it self-heals the next
   time a queue is built; (b) after a refresh, push the new metadata into the existing queue with
   `TrackPlayer.updateMetadataForTrack`. Not in the task, so nothing was changed.

4. ~~**The active row shows a spinner while playing.**~~ **RESOLVED** — see Round 5: the row now
   shows ‖ while playing, ▶ while paused, and the spinner only during real buffering.

5. **No artwork at all** — the new VK payload has no `album.thumb`, so every row falls back to the
   placeholder note. Needs a separate lookup or a show-level artwork fallback. Not in the task.

6. **The Android emulator density is overridden to 420** (`adb shell wm density 420`) so it matches a
   real Galaxy S21+ (411dp). Its default, 320 on a 1080p panel, gives a 540dp canvas — 1.34x wider
   than the iPhone in dp — which is what the old `modifiers` fudges were compensating. Revert with
   `adb shell wm density reset`, but then Android will legitimately look "smaller" again.

7. **`favorites` / `artists` still use the old native `useNavigationSearch` header**, not
   `AnimatedSearchHeader`, so they will not match the `songs` screen until they are migrated.

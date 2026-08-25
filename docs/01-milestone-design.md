# 01 — Design parity, favourites, search and playback milestone

Full record of the milestone, so the work can be resumed. Started 2026-08-24 as a UI-parity pass
and a backend sorting fix; grew into favourites, playlists, search and playback.

> **CLOSED 2026-08-25.** See "Milestone 01 — what shipped" at the end for the summary, and
> "OPEN QUESTIONS" for what is deliberately left open.

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

# Round 8 — favourites (2026-08-24)

Reported: no heart in the list, the heart in the player does nothing, the Favorites tab behaves as
if there were no playlist at all. All three were real, and they had three separate causes.

## The Favorites tab was calling a URL that does not exist

`apiUrls.playListUrl` was `${playlistUrl}/playlist` — i.e. `/api/playlist/playlist`. No such route
is mounted, so every refresh of the tab 404'd and the list stayed empty. That is the "нет плейлиста"
feeling exactly. The tab now calls `GET /api/playlist/frisky/favorites`.

## The heart in the player was a stub

`player.tsx` literally held

```ts
//temp fix
const isFavorite = false
const toggleFavorite = () => {
}
//const { isFavorite, toggleFavorite } = useTrackPlayerFavorite()
```

so the icon was hard-wired to the outline and the press handler was empty. The hook it replaced was
broken too, which is presumably why it was stubbed out: `favorites` was an unresolved **Promise**
kept in zustand state, so `isFavorite ? … : …` was ALWAYS truthy, tracks were matched by `url` — VK
re-signs those on every `audio.get`, so nothing ever matched — and nothing was ever sent to VK. The
same file also coloured the *hide* icon by `isFavorite`; that is now `isHidedSong`.

## There was no heart in the list at all

`TrackListItem` never rendered one. It now shows ♥ / ♡ before the ⋯ button, and tapping it toggles
without starting playback. The title block moved from `width: '100%'` to `flex: 1, minWidth: 0` so
the trailing icons keep their place instead of being pushed past the right edge.

## Favourites are server state now

They live in the user's VK playlist **Frisky-favorites**, which the backend already knew how to
create — nothing in the app ever called those endpoints.

* `GET /api/playlist/frisky` now stamps every track with `favorite`, so the heart in the list comes
  straight from the API.
* `GET /api/playlist/frisky/favorites` **creates the playlist on first use** instead of answering
  404. An empty Favorites tab is a valid state; a missing one is not.
* `PUT` does the same before adding, so the very first heart a new user taps works.
* `DELETE /frisky/favorites/:id` takes the id **as the app knows it** (the frisky one) and resolves
  the user's own copy before deleting. This matters: `audio.add` COPIES a track into the user's
  library under a NEW id, so the old code — `audio.delete(audio_id=<frisky id>, owner_id=<user id>)`
  — was addressing a track that does not exist. Nothing is deleted when the resolution fails.
* Tracks are matched across copies by `artist|title` (cleaned, i.e. without `FRISKY | `), because
  that is the only thing a track and its copy share.
* The playlist lookup uses `audio.getPlaylists` for the session user, falling back to the old
  `audio.searchPlaylists` filtered by owner. `searchPlaylists` searches ALL of VK: it can miss the
  user's own playlist and can return a stranger's playlist of the same name.
* `formatPlaylist` finally emits `owner_id`, which the openapi `TrackItem` has always declared.
* The favourites index is cached per user for 60s and dropped on every write, so lighting the hearts
  does not cost two extra VK calls on every page of the Songs list.

App side, `@/store/favorites` holds the playlist keyed by `artist|title` plus the toggles made since
the last fetch. The optimistic flip rolls back if the server refuses. The Songs list feeds it the
server flags, the Favorites tab replaces them wholesale (it IS the playlist), and the tab re-reads
itself on focus because hearts are toggled on other screens.

`usePlaylistState` grew a `merge` flag: the Songs tab keeps merging (it pages), Favorites must not —
merging would resurrect an un-hearted track from the MMKV cache forever.

## Three more bugs, found only by running it

**`audio.delete` does not remove a track from a playlist.** VK answers `response: 1` and the track is
served again by the very next `audio.get` on the playlist — verified on a real account: the heart
went out, the tab refreshed, and the row was back. The membership has to be dropped explicitly, so
the delete is now two calls: `audio.removeFromPlaylist(owner_id, playlist_id, audio_ids)` first, then
`audio.delete` of the copy to keep the library tidy. After the fix the playlist went 117 → 116 and
the row stayed gone.

**A debug build could not talk to Metro or to the dev API.** `plugins/withVkTrustAnchor.js` sets
`android:networkSecurityConfig`, and that REPLACES the platform default — including the
`android:usesCleartextTraffic="true"` Expo puts in the debug manifest. Every request died with
`CLEARTEXT communication to 10.0.2.2 not permitted by network security policy`, the app fell back to
a bundle that is not packaged in a debug APK, and showed the red "Unable to load script" screen. That
is why the emulator kept showing old code no matter what was rebuilt. The generated config now
carries a `cleartextTrafficPermitted="true"` block for `10.0.2.2`, `localhost` and `127.0.0.1` —
loopback and the emulator's view of it, nothing production ever talks to.

**The Favorites tab kept the stock white header titled "index".** `favorites/_layout.tsx` hid a
screen called `index_`; the file is `index.tsx`, so nothing was ever hidden. Fixed, and the screen
now uses the same `AnimatedSearchHeader` ("Favorites" / "Find in favorites"), paddings and scroll
handling as the Songs tab, so the two tabs are identical on both platforms.

Also on the way: `ios/Pods` + `Podfile.lock` were stale against the SDK 57 patch bumps, so
`expo run:ios` died in `pod install` ("could not find compatible versions for ExpoModulesWorklets",
then `ExpoFileSystem`, …). A clean `rm -rf ios/Pods ios/Podfile.lock && pod install` fixed it;
`expo run:ios` then reported **Build Succeeded, 0 error(s)**.

## What was verified

* api: 8 suites / **57 tests** green, including auto-creation, the copy resolution on delete, the
  `removeFromPlaylist`-before-`delete` order, and refusing to delete when the track is not in the
  playlist.
* app: `tsc --noEmit` clean apart from the two pre-existing errors (`MovingText`, `TrackShortcutsMenu`).
* **On the Android emulator, against the real VK account** (debug build on Metro, dev API on :3000):
  the heart renders in the list; tapping it PUTs and the row lights up; the track then appears at the
  top of the Favorites tab; tapping it again DELETEs and the tab drops it on the next focus; the
  player's heart shows the right state, toggles, and the list reflects it when the player is
  dismissed. The account was left as found (the test track was removed again; playlist back to 116).
* **On the iOS simulator**: the app builds, runs, logs in, lists songs with hearts, and the Favorites
  tab renders identically to Android. Taps were NOT injected — see open question 2b, iOS still has no
  touch injection here.

---

# Round 9 — the playlist picker on Favorites (2026-08-25)

A control to the right of the search box on the Favorites tab, with three kinds of choice:

* **Frisky** — the `Frisky-favorites` playlist. The default, and the only list the hearts write to.
* **All** — the user's whole VK audio library (`audio.get` with no `playlist_id`).
* any of the user's own playlists, listed with their track counts.

The filter is **not** sticky: every time the tab comes into focus it snaps back to Frisky. Browsing
somebody's old "Intelligent Electro Music" is a look around, not a mode to get stuck in — and the
heart always means the same thing, so a filter left on would only mislead.

## The playlist is born on the first heart

`GET /frisky/favorites` no longer creates anything. If the user has no `Frisky-favorites` yet, the
tab is simply empty; the playlist is created by `PUT /frisky/favorites`, i.e. when the first track is
hearted. (Round 8 had the GET create it too, which meant merely opening the tab wrote to the user's
VK account.)

## Endpoints

* `GET /api/playlist/frisky/playlists` — the user's playlists as `{id, title, count, is_frisky}`.
  `is_frisky` saves the app from matching on the title.
* `GET /api/playlist/frisky/favorites?playlist_id=<id|all>` — `all` drops the `playlist_id` from the
  VK call, an id reads that playlist, and no parameter means Frisky-favorites.

The heart means "is in Frisky-favorites" **everywhere**, so for `all` and for any other playlist the
flag is resolved through the artist|title index; only when the list IS Frisky-favorites is every row
lit by definition. Tapping a heart in those views therefore adds to (or removes from) Frisky —
exactly what it does on the Songs tab.

The Frisky playlist id is now resolved ONCE per request. VK allows three calls a second and this
handler already spends two or three of them.

## Two bugs in the making, caught on the device

**The picker's choice was wiped on the next render.** `useFocusEffect` re-runs its effect whenever
the callback identity changes, and `usePlaylistState` returns a fresh `handleRefresh` on every
render — so the focus effect, which resets the filter to Frisky, was firing constantly. The request
for the chosen playlist went out and the answer was thrown away. `handleRefresh` now lives in a ref
and the effect has stable dependencies.

**Other playlists must not reach the cache.** `usePlaylistState` took a `shouldCache` predicate: the
Favorites tab caches only the Frisky list, or opening the tab after browsing "All" would seed it with
791 unrelated tracks from MMKV.

## What was verified

* api: 8 suites / **60 tests** green, including `playlist_id=all`, an explicit playlist id, the
  playlists listing, and the GET that returns an empty list instead of creating the playlist.
* On the Android emulator against the real account: the picker opens with Frisky checked, "All"
  switches to the full library, "Intelligent Electro Music" shows its 7 tracks with dark hearts
  (none of them are in Frisky-favorites), and leaving the tab and coming back snaps the filter back
  to Frisky.
* On the iOS simulator: the same header and button render identically. Taps were not injected
  (open question 2b).

---

# Round 10 — search that actually searches (2026-08-25)

Both search boxes were filtering the array already on screen. On the Songs tab that meant the ~100
tracks of the current page out of a group that holds **10 000**; on Favorites the local filter was
dead code left over from the old header. Search now runs on the API.

## Songs — the whole Frisky group

VK has no "search inside this owner", so the backend pulls the group's catalogue (6000 tracks per
page, two pages) and filters it there, keeping it for five minutes. Verified: "sonder" returns 55
matches including episodes from July and June that were never loaded into the app.

`GET /api/playlist/frisky?q=…` — every word of the query must appear in "artist title", so
"dunn sonder" finds "Graham Dunn — Sonder Part 1" whatever the order.

## Favorites — the selected playlist, and then the rest of VK

`GET /api/playlist/frisky/favorites?playlist_id=…&q=…` reads the WHOLE selected list (count 6000)
and filters it. With **All** the answer also carries `global`: `audio.search` across VK, with the
heart resolved against Frisky-favorites so a track the user already has is never shown empty.

The screen renders the user's own matches, then a hairline seam, then the heading **Suggested for
you** above the VK-wide results. That section belongs to the **All** view only — with a playlist
selected the search stays inside it, and the app checks the selection as well as the payload. The
upper list drops its tab-bar bottom padding while the second section is present, or the seam floats
a screenful below the last row.

Queries are debounced 400ms and ignored under two characters.

## What was verified

* api: 8 suites / **63 tests** green — new cases for the group catalogue search (including Part 1
  before Part 2 in the results), for searching inside a playlist with `count: 6000`, and for the
  `all` + `q` answer carrying `global`.
* On the Android emulator against the real account: "sonder" on Songs returns older episodes that
  were not in the loaded page; "patrize" on Favorites returns the two matches inside
  Frisky-favorites; "moby" with **All** shows the user's own Moby track, the divider, and then
  the "Suggested for you" heading and the VK-wide results (In My Heart, Wait for me, Go, …).
* On iOS the tab renders unchanged. The search itself was NOT exercised there — typing needs touch
  injection, see open question 2b.

---

# Round 11 — the heart writes where you are looking (2026-08-25)

Until now every heart, everywhere, meant the `Frisky-favorites` playlist. Now it means **the list on
screen**:

* Favorites with a playlist selected → that playlist;
* Favorites with **All** → the VK library itself, no playlist involved;
* the Songs tab, the player, anywhere without a picker → `Frisky-favorites`, created on the first add.

`PUT /frisky/favorites` and `DELETE /frisky/favorites/:id` take the same `playlist_id` the list does
(`<id>` / `all` / absent). App-side the store carries a `scope`, which the Favorites tab sets from
its picker and the Songs tab resets to Frisky when it comes into focus. Changing the scope clears
the heart state — the same row means something different in a different list.

Removing is scoped too, and it is no longer a delete: `audio.removeFromPlaylist` takes the track out
of the selected playlist, and `audio.delete` runs **only** under `all`, where there is no playlist to
leave. Deleting the library copy would have taken the track out of every other playlist as well.

## Sorted by when it was added

The Favorites tab no longer part-sorts. VK returns a library and a playlist newest-added first, and
that is the order this tab wants; grouping "Part 2" next to its "Part 1" moved old tracks to the top.
Verified: a freshly hearted track is the first row.

## A bug the type system could not see

`resolveTarget` did `requested?.trim()`. A query string sends the playlist id as text, but the app's
JSON body sends it as a **number** — so the first add to a real playlist answered
`{"errMessage":"requested?.trim is not a function"}`. Coerced with `String(...)`, and there is a test
for the numeric form now.

## What was verified

* api: 8 suites / **66 tests** green.
* On the Android emulator against the real account: hearting a suggestion under **All** adds it to
  the library only (`playlist_id: all`, no `album_id`) and it becomes the first row of the list;
  un-hearting it there removes it from the library; on the Songs tab the heart still posts without a
  `playlist_id`, i.e. to Frisky-favorites, and the playlist went 116 → 117 → 116 across the round
  trip. Adding to an arbitrary playlist and removing again was exercised against the user's empty
  "VKMessages" playlist (0 → 1 → 0), which also showed that `audio.removeFromPlaylist` leaves no
  copy behind in the library.
* The account was left exactly as found.

---

# Round 12 — the sig bug, and what a refocus should not reset (2026-08-25)

## Every multi-word VK search was silently failing

"moby heart" found nothing while "moby" alone found "Moby — In My Heart". The reason was not
matching at all: `searchVkAudio` passed `encodeURIComponent(query)` to `vkMethod`, which signs the
url it builds — but VK verifies the signature against the **decoded** parameters. So the request was
signed over `q=moby%20heart` and checked as `q=moby heart`, and VK answered

```
error 5: User authorization failed: sig param is incorrect
```

which the `catch` turned into an empty suggestions list. Single words have nothing to encode, which
is why they worked and made it look like a relevance problem. The query now goes through raw, with
`& = # ?` stripped so it cannot break the query string.

There is also a fallback for the case where VK genuinely finds nothing for the phrase: each word is
searched on its own and the results are kept only if they contain **all** the words — a full-text
search, not a phrase match. It is spaced out by 350ms because VK allows three calls a second.

While there: the "All" search already fetches the whole library, so the library index for the hearts
is now built from that response instead of fetching all 6000 tracks a second time.

## Closing the player is not "entering the tab"

The filter reset lived in `useFocusEffect`, and opening and closing the player refocuses the screen
— so coming back from a track threw away the selected playlist. The reset now hangs off `tabPress`
instead: entering the tab from the tab bar returns you to Frisky, everything else leaves the list
alone. The listener is attached to the parent navigator as well, because this screen sits inside its
own Stack and never receives `tabPress` itself.

The search's empty state also stopped taking a screenful: with suggestions underneath, an empty
result is one grey line instead of the placeholder artwork.

## What was verified

* api: 8 suites / **66 tests** green, with the search test now asserting the raw (unencoded) query.
* On the Android emulator: "moby heart" under **All** returns "In My Heart" and four more Moby
  tracks under "Suggested for you"; selecting **All**, opening the player and closing it leaves the
  filter on All; switching to Songs and back returns it to Frisky.

---

# Round 13 — the Settings screen knows who is signed in (2026-08-25)

It greeted "Welcome, undefined!" and drew an `<Image>` with no source, because it read
`state.user` — a prop a route component never receives. Nothing ever fetched a profile.

`GET /api/auth/me` now answers with the four fields the screen shows — id, first/last name,
screen_name and `photo_200` — off `users.get`. The existing `/profile` was no use here: it is
`execute.getUserInfo`, which returns the whole VK bootstrap (ad limits, feature flags, hundreds of
lines) and no avatar at all.

The screen shows the avatar on a round plate, `Welcome, <name>!`, and under it the account the app
is actually signed in as — `@screen_name · id <vk id>`. That replaced "or should we call you …?",
which was a second guess at the same name. The `App url` debug line is untouched, by request.

## What was verified

* api: 8 suites / **68 tests** green, including the new `/api/auth/me` cases (the four fields, and
  404 when VK returns nobody).
* On both the Android emulator and the iOS simulator the screen renders the real avatar, name,
  `@envarg · id 37758500`, the Logout button and the untouched debug line.

---

# Round 14 — a window over the archive, and playback that follows the list (2026-08-25)

## The list is now a window, not a page

Both tabs fetched exactly one page of 100 and stopped: the group holds **10 000** tracks, so almost
all of it was unreachable. Loading everything instead would grow the scroll without bound.

`useWindowedTracks` keeps at most **4 pages of 50**. Reaching the end appends the next page and drops
the first; reaching the top prepends the previous one and drops the last. FlashList v2 keeps the
visible rows still while that happens (`maintainVisibleContentPosition` is on by default), so the
scroll neither jumps nor grows. Both tabs share it — the Songs list and every favourites list.

For that to work at all the list had to start scrolling itself. It used to sit inside an
`Animated.ScrollView` with `scrollEnabled={false}`, which mounts every row at once and makes paging
impossible; the header animation now rides a plain `onScroll` off the list.

**A short page is not the end.** The first attempt stopped after two pages because
`/frisky?count=50&offset=50` answers with **49** items — VK drops restricted tracks from a page.
Only an empty page ends the walk now. Verified by scrolling to `offset=2400` and back.

## Playback follows the list, not the row number

`trackKey` now includes `owner_id`: VK audio ids are unique **per owner**, so the group's track
456263688 and a track 456263688 in the user's library are two different songs, and skipping by the
bare id landed on the wrong one.

The queue is built from the visible list starting at the tapped track and contains only tracks that
have a url, so when one ends the next row plays and an unplayable one is stepped over.

## Played tracks are marked

A show runs an hour and the list is a chronological archive, so `usePlayedStore` (MMKV-backed)
remembers what ran to the end — `PlaybackActiveTrackChanged` marks the outgoing track only when it
was within 15s of its duration, so skipping through the list does not tick everything off. A played
row shows a ✓ and a muted title.

## What was verified

* api: 8 suites / **68 tests** green.
* On the Android emulator: scrolling pulls `offset=50, 100, … 1250, … 2400`, scrolling back up
  pulls the earlier pages again; the Favorites tab pages the same way; tapping a row plays exactly
  that track; seeking to the end of it starts the NEXT row automatically and the finished one comes
  back with a ✓ and a dimmed title.
* On the iOS simulator the rebuilt list renders unchanged.

---

# Round 15 — calls pause, notifications duck (2026-08-25)

A phone call killed the show and left it stopped; a notification sound did the same.

`setupPlayer` now asks the platform to arbitrate audio focus — `autoHandleInterruptions: true`,
`androidAudioContentType: Music`, `iosCategory: Playback` — and `updateOptions` sets
`android.alwaysPauseOnInterruption: false`. With content type Music a *short* interruption (an SMS)
only ducks: the system lowers the volume for as long as the sound plays and restores it after. A
call takes focus transiently, which pauses playback and hands it back when the call ends.

The playback service also listens to `Event.RemoteDuck` and keeps a `resumeAfterInterruption` flag:
it pauses on `paused: true`, resumes on `paused: false` if it had been playing, and on `permanent:
true` (another player took over for good) it stays paused. Both paths are idempotent, so it does not
fight the automatic handling.

## What was verified

* On the Android emulator, against `dumpsys audio` and `dumpsys media_session`:
  * incoming call → our focus entry shows `loss: LOSS_TRANSIENT` and the session freezes
    (`speed=0.0`, position stops at 95133);
  * call ended → focus back with `loss: none` and the session resumes (`speed=1.0`, position 95135);
  * `adb emu sms send` → the session stays `PLAYING` at `speed=1.0`, i.e. the notification ducks
    instead of stopping the show.
* iOS is configured the same way but was NOT exercised: a call cannot be injected into the
  simulator. See open question 2b.

---

# Milestone 01 — what shipped

Fifteen rounds, all verified on the Android emulator against the real VK account, and rendered
side by side on the iOS simulator. iOS taps were never injectable here (open question 2b).

**Parity and layout** (rounds 1–7). One layout for both platforms: zeroed the per-platform
`modifiers`, one font weight, shared rgba plates instead of `expo-blur`, a mini player docked on
the tab bar with a divider, halved side paddings, an opaque stack background that stopped the
plates bleeding through the player, and a rewritten welcome screen.

**Backend list correctness.** `Part 1` before `Part 2` in the *new* VK title format without losing
the old rules, `FRISKY | ` stripped from artist and title, and `owner_id` finally emitted by
`formatPlaylist`.

**Favourites** (rounds 8, 11). They live in the user's VK playlist `Frisky-favorites`, created on
the first hearted track. The heart renders in the list and in the player, and writes to **the list
on screen**: the selected playlist, the VK library under "All", or Frisky-favorites everywhere
else. Removal drops playlist membership (`audio.removeFromPlaylist`) and only deletes the library
copy under "All" — `audio.delete` alone leaves the track in the playlist, which VK reports as
success.

**The playlist picker** (rounds 9, 10, 12). A filter button beside the search box: Frisky, All, or
any of the user's playlists, reset when the tab is entered but not when the player closes. Search
runs on the server — the whole 10 000-track group for Songs, the whole selected list for
Favorites — and under "All" it also returns VK-wide matches under "Suggested for you".

**Playback and paging** (round 14). The list is a sliding window of 4 × 50 pages over the archive
instead of one fixed page of 100. Tapping a row plays *that* track (`trackKey` now includes
`owner_id`, because VK ids are unique per owner), the next row follows automatically, unplayable
tracks are skipped, and a track that ran to the end is marked played (✓, muted title, MMKV-backed).

**Interruptions** (round 15). A call pauses and resumes; a notification ducks.

**Settings** (round 13) shows the real profile: avatar, name, `@screen_name · id`.

**Three bugs that only running it could find:** `audio.delete` not removing playlist membership;
`android:networkSecurityConfig` blocking cleartext, which meant a debug build could reach neither
Metro nor the dev API; and `encodeURIComponent` on a VK query breaking the request signature, which
silently emptied every multi-word search.

Tests: api **8 suites / 68 tests**. The app typechecks clean apart from two pre-existing errors
(`MovingText`, `TrackShortcutsMenu`).

---

# Release — 2026-08-25 (milestone 01)

* pushed `ebf0ce1..d96e91f` — api, app, docs and the version bump.
* **api `varg/visky-api:1.5.35`** built and pushed, `deployment "visky-api" successfully rolled
  out` (ctx=oracle, ns=frisky), health 200, the pod runs 1.5.35.
* **Android built LOCALLY** with `scripts/build-app-local.sh` (profile `production`, JDK 17,
  `eas build --local`): artifact stayed on the machine at
  `app/build/visky-20260825-124611.aab` (77 MB) and only the store received it —
  submitted to Google Play, internal track, versionCode **61**.
  Submission: https://expo.dev/accounts/varg/projects/visky/submissions/423eb0b5-a278-49fd-b2a3-4c83c3544ab2
* Shipped with open question 2b still open: iOS renders identically but no tap was ever injected
  into that simulator.

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

7. ~~**`favorites` / `artists` still use the old native header**~~ **PARTLY RESOLVED** — `favorites`
   now uses `AnimatedSearchHeader` and matches `songs` on both platforms. `artists` is still a stub
   screen ("Artist Screen") with nothing to migrate yet.

8. **Nothing about favourites has been exercised against real VK.** The emulator has a RELEASE build
   (`versionCode=1`, no `DEBUGGABLE` flag, embedded bundle — Metro served it 0 bundles) with a live
   VK session in its storage. Loading the new JS means installing the debug APK, whose signature
   differs, which means uninstalling first — and that wipes the session, which only you can restore
   because logging in needs your credentials and the 2FA code. So, per your rule, **nothing was
   deployed and nothing was installed**.

   What still needs a real account, once a build with this code is on the device:
   * `audio.getPlaylists` actually lists the user's playlists with this Kate-Mobile token;
   * `audio.createPlaylist` succeeds and the new playlist is found again by the next lookup;
   * `audio.add` with `album_id` puts the track in the playlist and returns the copy id;
   * `audio.delete` of the resolved copy removes it from the playlist;
   * the `artist|title` match holds for real data (a title that VK stores differently in the copy
     would break the heart, though never destructively — a failed match deletes nothing).

   **RESOLVED on 2026-08-25** — you logged in on both emulators and the whole flow was exercised
   against the real account: `audio.getPlaylists`, `audio.createPlaylist`, `audio.add` with
   `album_id`, and the delete path (which is where `audio.removeFromPlaylist` turned out to be
   required). The `artist|title` match held for real data. What is still untested by hand is the iOS
   side of the same taps — open question 2b.

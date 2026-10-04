# 10 — What a heart means, and where the picture comes from

Full record of the milestone, so the work can be resumed. Started 2026-09-17.

Four requests, all of them from using the app rather than reading it: the empty outline on every
row of a thousand-track list, a Favorites tab that was a column of placeholder covers, years of
favourites that the Favorites tab could not see because they predate the playlist it is made of,
and a heart in the player that was dark for a track that has been a favourite for months.

Three of them are the same bug wearing different clothes: **`audio.add` copies a track under a new
VK id**, so the frisky original and the user's favourite share nothing but their words — and every
part of the app that tried to join them by id found nothing.

---

## Goal

1. **Take the empty heart out of the listing.** Adding is a swipe right, removing a swipe left; the
   heart only says what already is.
2. **Serve the Favorites tab from our own database.** From VK, only the id and the signed url.
3. **Sweep the library into the playlist.** Everything the group uploaded that sits loose in the
   user's VK audio, in the order it was added.
4. **Fix the heart in the full player.**

---

## The listing: a heart that says, and gestures that do

`components/TrackListItem.tsx`.

The heart was the only way to add a favourite, so every row carried an outline that looked like a
control and read as noise down a list that is thousands of shows long. It is now **informative**:
lit for a track that is in the favourites, absent otherwise.

The two actions moved to `ReanimatedSwipeable`, the same component the Signed-in list uses to sign
a device out — mirrored, so the directions mean opposite things:

* **swipe right** → `Favorite`, and only on a row that is not one yet;
* **swipe left** → `Remove`, and only on a row that is.

The action that would be a no-op is not rendered at all, so a swipe that offers nothing simply
snaps back. The row is opaque, because it slides over its own panel. The **swipe commits by
itself** — see "Three reports from the desktop" below for why the first version, which waited for a
tap on the revealed panel, was wrong — and the row closes on the next frame, so the heart flips
under a row that is already back in place.

**The desktop keeps a button.** A pointer has no swipe worth discovering — the trade `DeviceRow`
already makes — so on web the heart reappears on hover and is pressable there. On a touch screen it
is inert, and says so: `accessibilityRole` is `image`, not `button`.

---

## The Favorites tab: the picture was in the database all along

`services/friskyCache.ts`.

`enrich()` looked every track up by `track_id` — `${owner_id}_${id}`. For the Songs tab that is the
group's own row and it works. For the Favorites tab **every row is a copy**: `audio.add` re-ids the
track, so the lookup found only the bare row the same request had just written for the copy, and
the tab was served VK's answer untouched — no cover, no tracklist, no show.

The copy is now resolved to the original through the **match keys**, which are the only identity
the two share: artist, the words of the title with the month and the part number taken out, and the
period. `resolveTwins()` runs one query per page for every matched row by those artists and scores
the candidates:

* a different `title_key` is never the same show — score 0, whatever else agrees;
* a different year, or a different month inside the same year — 0;
* the same part is better than a sibling part, but a mismatch is not fatal: Part 1 and Part 2 are
  one episode;
* the group's own row wins a tie, because a copy of a copy knows no more.

Everything downstream — tracklist, genres, show cover, artist — is read off the row that was found.
Artwork falls back through VK → the copy's own cached artwork → the original's → the show's, and a
track with nothing matched still gets whatever cover the cache holds, which is the case that turned
the tab from placeholders into pictures.

`url` is still VK's, and still never stored. It is signed per token and device, and a persisted one
is dead on arrival.

---

## The sweep: `POST /api/playlist/frisky/favorites/sync`

The Favorites tab shows the `Frisky-favorites` playlist. Favourites that predate that playlist are
loose in the VK library and invisible to it. The sweep walks the library, keeps what the group
uploaded, and adds what is missing.

**Membership is decided by our database, not by the words of a title.** The old
`create-favorites` path (still there, untouched) greps for `feelin_frisky` — the advert the group
has added and dropped several times over, so it catches a fraction of the archive. `friskyShowKeys()`
instead reads every `vk_tracks` row owned by `-42311167` and turns it into `artist_key|title_key`.
With no database there is no answer, and the sweep returns `skipped` / `catalog_unknown` **without
spending a single VK call** — adding on a guess would put someone's unrelated music in the playlist
and cannot be undone from the app.

**Order is the library's own order, reversed.** VK serves a library newest-added first; the
playlist is filled from the bottom up, so it ends up reading the way the library does. The copy's
`date` was not used — it says when VK made the copy, not when the listener hearted the show.

**`audio.addToPlaylist`, not `audio.add`.** These tracks are already the user's own copies, and
`audio.add` would copy each of them a *second* time — a sweep meant to tidy the library would
double it. Chunks of 50, 350 ms apart because VK allows three calls a second, with a per-chunk
fallback to `audio.add` one at a time if the method is refused. Capped at 200 per run; what is left
comes back as `remaining`, and the app says so rather than looking finished.

Idempotent by construction — it compares the library against the playlist index every time — which
is what makes it safe to run on every visit.

**Where it runs from.** `store/settings.tsx` (MMKV, guarded like every other store here) holds one
switch, *Sync favorites automatically*, **on by default**. The Favorites tab runs the sweep once
per visit when the picker is switched to **All**, and reloads only if something was actually added.
Settings also carries *Synchronize playlists*, which runs it by hand — kept visible in both modes,
because a capped sweep can be worth repeating.

---

## The player's heart, and the delete it was one tap from

`store/favorites.tsx`.

Two defects, one cause: a **single key map** shared by the player and whatever list the Favorites
tab had selected.

1. `hydrate()` existed and **was never called**. Nothing filled the map until a tab had been
   opened, so a cold start straight into the restored track showed an empty heart.
2. `setScope()` emptied the map on every change of the picker, and the toggle wrote to that same
   scope. So after looking at **All**, un-hearting a track in the player did not take it out of a
   playlist — it ran `audio.delete` against the VK library.

The store now tracks two lists:

* `keys` / `overrides` — the list on screen, which is what the rows of the Favorites tab read;
* `friskyKeys` / `friskyOverrides` — `Frisky-favorites`, always, which is what the **player** reads
  through `useIsFriskyFavorite` / `useToggleFriskyFavorite`.

`applyServerFlags` now says which list the server spoke about: the Songs tab and the suggestions
mean Frisky-favorites, a playlist view means *that* playlist, where every row is a member by
construction — writing those into the frisky map would have marked the whole library a favourite.
Returning the scope to Frisky restores the map instead of blanking it, because coming back to a tab
does not refetch it. `hydrate()` runs once per launch from `(app)/_layout.tsx`.

---

## The list that rewound itself

Reported from the phone: page the Favorites tab ("All") to the bottom, start a track, open the
player, collapse it — and the list is back at the top, reloaded.

Collapsing the player **refocuses the tab underneath it**, and the tab's `useFocusEffect` called
`reset()`. `reset()` is page 0 by definition: the window it had built, up to four pages deep, was
thrown away along with the scroll, and the only way back was to page down again by hand. The reason
the focus effect exists is real — hearts are toggled in the player and on the Songs tab, so the
list has to be re-read when it comes back — but "re-read" was doing far more than that.

`useWindowedTracks` already had the right call, and its own comment says so: `refreshWindow()`
re-reads the pages that are ON SCREEN, keeps their indices, and keeps a page it already holds when
the answer comes back empty, so a hiccup never blanks the list. The tab uses that on focus now, and
`reset()` is left to what actually means "start over": pull-to-refresh, a tap on the tab bar, and
switching the picker to another playlist.

---

## Three reports from the desktop, and what they were

**The spinner doubled on the way into an artist.** Two indicators for one load: the header's
refresh button (drawn on web only, because `RefreshControl` there is a stub) and the overscroll
indicator `PullToRefresh.web` draws — plus, on the artist screen, a third in the middle of the
empty list. The button is now **gone from Songs, Favorites and Artists**: the trackpad overscroll
has been the real gesture since milestone 09, and a second control for it was only ever a
workaround. The empty-list spinner went with it; the refresh draws one for exactly that moment.

**A swipe hung the row.** The first version of the gesture revealed a panel with a button in it and
waited for a tap. On a phone that is a second deliberate act for something the swipe already said;
on the desktop, where the drag is a trackpad push, the row simply stayed open — nothing added, and
no way back. **The swipe itself is the action now**: `onSwipeableWillOpen` toggles, the panel is
scenery with no press handler anywhere in it, and the row closes itself **on the next frame** —
closing in the same tick asks the spring to open and close at once, which is what left it stuck
half-open. The add panel is blue, not green.

**The Favorites tab drew a heart on every row.** Every row there IS a favourite, so the heart said
nothing and read as a column of decoration. `showFavorite={false}` turns it off for that list (the
gesture still works, and swipe left is how a row leaves), and a row removed this session
**disappears at once** — the window is not refetched on a toggle, so it used to sit there looking
exactly as it had.

---

## Tests

| suite | what it pins |
|---|---|
| `app/__tests__/components/TrackListItem.test.tsx` (9) | no outline on a non-favourite; right swipe offers add only where adding means something, left swipe remove only where it does; the SWIPE commits and the panel has nothing to tap; the row closes on the next frame, not in the same tick; no heart at all in a list that is the favourites; the heart is inert on touch and a button on hover |
| `app/__tests__/store/favorites.test.ts` (8) | the player's heart survives a scope switch; a playlist view does not light it; the Songs tab's flags do; hydrate with no tab open; a player toggle writes scope `undefined`, never `all`; rollback on refusal |
| `api/__tests__/router/api/favoritesSync.test.ts` (4) | only the group's tracks, oldest first, through `addToPlaylist`; nothing on a second run; nothing at all — not even a read — when the catalogue is unknown; the one-at-a-time fallback |
| `app/__tests__/components/AnimatedSearchHeader.test.tsx` (4) | no refresh button on web or on a phone, and nothing spinning in the header; the title, the search callback and the action still work |
| `app/__tests__/hooks/useWindowedTracks.test.tsx` (3) | paging down then refreshing re-reads the same pages in place; only an explicit reset returns to page 0; an empty answer keeps the page already held |
| `api/__tests__/services/friskyEnrich.test.ts` (5) | a copy is served the original's cover and tracklist; the show cover as fallback; VK's own cover still wins; a different show by the same artist is left alone; so is a different month |

api: 19 suites, 163 tests. app: 19 suites, 120 tests. Both green.

New fakes: `swipeable.tsx` keeps the render props so a test can ask what each direction offers, and
`fastImage.tsx` renders as itself. `mmkv.ts` gained `getBool`/`setBool`, throwing like the rest of
it.

---

## What is **not** done

* **Nothing was run on a device.** The swipes, the hover heart and the sweep have unit tests and no
  runtime evidence. Under the rules of milestone 09 that is `blocked`, not `pass`.
* **`audio.addToPlaylist` has never been called against real VK from this codebase.** The fallback
  exists precisely because the method is unproven; which path actually runs is unknown until it is
  run.
* **The sweep is only as good as the cache.** `vk_tracks` rows for the group are written when a
  `/frisky` page or the catalogue is loaded, so a fresh database knows nothing and answers
  `catalog_unknown` — correct, and invisible to a user who does not know why nothing happened.
* **Nothing is deployed**, and the milestone-09 store items are still open.
* **The old `create-favorites` endpoints** (POST/PATCH, the `feelin_frisky` grep) are superseded by
  the sweep but were left in place.

---

## Decisions worth remembering

* **Artist + title words + month is the join.** VK ids belong to VK, and a copy is a new id. Every
  feature that tried to join the two sides by id has failed the same way.
* **A heart that cannot be pressed is a better heart.** In a list of a thousand rows, a control
  that is off for almost all of them is noise; the gesture costs nothing when it is unused.
* **"I cannot tell" is not "nothing matches".** The sweep's most important branch is the one where
  it does nothing.
* **A copy is not a duplicate to make.** `audio.add` was the obvious call and the wrong one.
* **In an API test, assign INTO `req.session`, never over it.** Replacing the express-session
  object takes `save()` with it and the response never finishes — four tests hung on that.

# 03 — The frisky.fm metadata cache

Full record of the milestone, so the work can be resumed. Started 2026-08-26, the day
milestone 02 closed.

A track in the Songs tab is a two-hour radio show. VK carries the audio and a name; the
tracklist inside it, the genres, the artist and their photo live on the official radio API and
were never shown. This milestone joins the two and keeps the result in Postgres.

---

## Goal

1. **Cache the playlist.** Every refresh writes the rows it served to Postgres — *without the
   audio urls*.
2. **Fetch the rest in the background** from `api.frisky.fm/v3`: tracklist, genres, images.
3. **Merge on the next read.** The next refresh, or the next tab switch, serves VK data with
   the cached frisky data merged into it.
4. **Backend only.** The app gets one thing: a reason to refresh.

---

## Part A — What the radio API can and cannot do

`https://api.frisky.fm/v3`, no key, no auth.

| Call | Answers |
|---|---|
| `GET /artists?limit&offset` | the directory — 5592 artists, paged |
| `GET /artists/{id}` | genres, biography, photo, links, reach |
| `GET /mixes?artists_id={id}&limit&offset&order=-id` | the artist's shows: title, slug, genres, **track_list**, show/episode refs, reach |

**There is no search.** `?title=`, `?url=` and `?q=` are accepted and answer with an empty
body — silently, not with an error. The only filters that work are `<model>_id`. That single
fact decides the whole design: "which frisky artist is this VK track by" can only be answered
from a local copy of the directory, so the directory is mirrored (31s, once a week) and
everything else is fetched per artist on demand.

---

## Part B — The join, when neither side has the other's id

VK ids belong to VK, frisky ids to frisky, and nothing links them. The two describe the same
broadcast in different words:

```
frisky.fm   "Tech Coast Tribal - 06 May 2016 - El Reyalto"   url: el-reyalto-at-05-06-2016
VK (old)    artist "FRISKY | El Reyalto"
            title  "May 2016 - Tech Coast Tribal (Part 1) [vk.com/feelin_frisky]"
VK (new)    artist "El Reyalto"
            title  "FRISKY | Tech Coast Tribal August 2026 - Part 2"
```

So the join is on what they *do* share — **artist + month + the words of the title**
(`helper/friskyMatch.ts`):

- **artist key** — the name, normalised: `FRISKY | El Reyalto` and `El Reyalto` → `elreyalto`.
- **title key** — the title's words with the artist, the date, the part number, the
  `[vk.com/...]` suffix and the stopwords removed, sorted. Both sides reduce to `coast tech
  tribal`.
- **period** — the month. The day is not required: VK uploads one row per show and names only
  the month.
- **score** — Jaccard over the title words; a same-month candidate gets `0.5 + 0.5 × similarity`,
  everything else gets the raw similarity, and `0.34` is the floor.

Two rules were added because the tests refused them without:

- **A minimum title overlap (0.2), always.** Without it, the same-month bonus alone cleared the
  floor and `"Deep Blue Sessions August 2026"` matched `"Tech Coast Tribal - August 2026"` on the
  month alone.
- **The air date breaks the tie.** Tech Coast Tribal is *weekly*: frisky lists four August 2026
  mixes with the same artist, the same title and the same month, and VK names none of them. The
  only day-level facts available are frisky's slug (`el-reyalto-at-08-14-2026` — the sole place
  the exact date appears; the title never says it) and VK's upload time. Nearest wins.

Parts are stripped before matching, so "Part 1" and "Part 2" are two VK rows resolving to the
one mix — which is correct: it is one show, cut in half for upload.

### How well it matches

Measured against live frisky data, synthesising both VK title shapes for the 25 newest mixes of
five artists: **180/206**. The misses are all in the deep archive and all frisky's own data:
weekly shows from 2007 whose slugs are malformed (`16_bit_lolitas-at-01-01-200712` — not a date),
which leaves a dozen identical January 2007 candidates and nothing to choose between them. On
the recent monthly uploads — which is what the Songs tab actually shows — artists matched 50/50.

---

## Part C — Where it lives

Three tables (`1756600000000-FriskyCache`):

| Table | Holds |
|---|---|
| `vk_tracks` | the playlist as served: ids, artist, title, duration, VK upload date, artwork, the match keys, and which mix it resolved to |
| `frisky_artists` | the mirrored directory + the detail (bio, photo, genres) |
| `frisky_mixes` | one row per broadcast: genres, **track_list**, show, air date |

**`vk_tracks` has no `url` column, and must not grow one.** A VK audio link is signed for one
token, one device and a short life. Persisting it would hand out links that are dead on arrival
and would leak one user's signature to another. The stream is always re-read from VK — the
cache holds only what does not expire.

`frisky_mixes` likewise drops `mix_url` / `mix_url_64k`. frisky serves its own mp3s; the app
plays VK and only VK, and a second set of media links in the same row would only invite
something to play the wrong one.

---

## Part D — The loop

```
GET /api/playlist/frisky
   ├─ remember(raw VK items)      → vk_tracks   (before cleanupData: it strips the month,
   │                                             and the month is half the match)
   ├─ enrich(response.items)      ← frisky_mixes + frisky_artists
   └─ kick()                      → wake the worker, do not wait for it

worker (every 60s, and on every refresh)
   ├─ syncArtistDirectory()       weekly TTL
   ├─ take 25 pending rows, grouped by artist
   ├─ per artist: /artists/{id} + /mixes?artists_id={id}   (24h TTL)
   ├─ match → vk_tracks.frisky_mix_id
   └─ onEnriched(ids) → broadcastCatalog → every open socket
```

The whole feature is optional, in the same way Kafka and Postgres already are: with `DB_HOST`
unset or `FRISKY_API_ENABLED=false`, `remember()` and `enrich()` are no-ops and the playlist is
served exactly as VK sends it. frisky.fm being down never reaches a request — every call to it
is made by the background job, one at a time, 250ms apart.

### The app's whole share of this

One frame:

```jsonc
{"t": "catalog", "track_ids": ["-42311167_101", ...], "server_now_ms": 1756...}
```

It carries ids, not data — the merged track comes from the REST route like everything else, so
the merge lives in exactly one place. `useWindowedTracks` re-reads **the pages that are on
screen**, keeping the window where it is. It deliberately does *not* call `reset()`: that throws
the window back to page 0, and yanking a user who is scrolled deep into the archive up to the
top, for a tracklist they did not ask for, is worse than not showing it.

---

## Also fixed

`formatPlaylist` had shipped two placeholders since the first milestone: a `genre_list` reading
`"Unknown Genre"` and a `track_list` holding one row of `{title: "string", artist: "string"}`.
The app rendered them as if they were real. Both are now empty arrays — a track nothing is known
about gets nothing — and `multipart` is read off the title instead of being hardcoded `false`.

---

## Verified

Against a throwaway Postgres container and the live frisky API:

- migration applies; `vk_tracks` has no url column
- 5592 artists mirrored in 31s; 750 mixes for two artists in 5s
- both parts of one show → the one mix, and the **14 August** episode out of four August ones
  (VK upload 16 August)
- a 2016 track matched to `el-reyalto-at-05-06-2016` with its 10-track tracklist
- an artist frisky has never heard of → `unmatched`, served as VK sent it, retried in 6h
- 119 unit tests, `esbuild` bundle contains the new entities and the migration

## Not done

- `part_list` is still a one-element stub built from the VK url (pre-existing `TODO`).
- Nothing in the UI *shows* the tracklist yet — `PlayerTrackListBar` still has
  `isHaveTrackList = false` hardcoded. The data now arrives; drawing it is the next milestone.
- Mixes frisky serves with an empty `track_list` (most of the newest ones) stay empty. That is
  frisky's data, not ours.

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

## Part A — What the radio API actually offers

`https://api.frisky.fm/v3`, no key, no auth.

| Call | Answers |
|---|---|
| `GET /search?query&limit&offset` | `{Mixes, Shows, Episodes, Artists}` — all four models for one query |
| `GET /mixes?artists_id={id}&limit&offset&order=-id` | that artist's whole run of shows |
| `GET /mixes/{id}` | one mix: genres, **track_list**, show and episode refs |
| `GET /artists/{id}` | genres, biography, photo, links, reach |
| `GET /episodes/{id}` | the broadcast: **air_start**, genres, image, summary |

**`/search` is the only text entry point, and it is easy to miss.** The REST-looking filters do
not search: `/mixes?title=`, `?url=` and `?q=` are accepted and answer with an empty body —
silently, not with an error — and the only filters that work on a collection route are
`<model>_id`. The first cut of this milestone concluded from that there was no search at all and
mirrored the entire 5592-artist directory to get a name→id map. `/search` replaced all of it.

---

## Part B — Episodes: what a VK track really maps to

A show runs two hours. VK caps a track at one, so the group uploads it as `Part 1` and `Part 2`.
frisky splits its own recordings too, and `episode_id` is what says the pieces are one
broadcast:

```
episode 73077  "Hurly Burly - 26 May, 2026"   air_start 2026-05-26T14:00:00Z
   ├─ mix 73078  url fady-ferraye-at-05-26-2026    track_list []
   └─ mix 73079  url fady-ferraye-at-05-26-20261   track_list [{title:"Part 2"}]
```

So **both VK parts resolve to the same episode and are served the same tracklist**, which is
what they are: one show. And the tracklist has to be read off the *episode*, not off whichever
piece happened to match — episode 7486 has fourteen mixes and exactly one of them carries its 25
tracks; the other thirteen are empty.

Two shapes of junk fall out of this and are handled:

- **A lone `{title: "Part 2"}` row** is a label for a human reading the page, not a tracklist.
  Treated as empty so a sibling with the real thing wins.
- **The digits after the date in a slug** (`fady-ferraye-at-05-26-2026`**`1`**) are a collision
  counter, not part of the year and not a part number — frisky reuses a slug and appends
  1, 2, … 16. Reading them as a broken date left every mix of a long-running show dateless.

---

## Part C — The join, when neither side has the other's id

VK ids belong to VK, frisky ids to frisky. The two describe the same broadcast differently:

```
frisky.fm   "Hurly Burly - May 2026 - Fady Ferraye"      url: fady-ferraye-at-05-26-2026
VK (old)    artist "FRISKY | Fady Ferraye"
            title  "May 2026 - Hurly Burly (Part 1) [vk.com/feelin_frisky]"
VK (new)    artist "Fady Ferraye"
            title  "FRISKY | Hurly Burly May 2026 - Part 2"
```

The join is on what they *do* share — **artist + month + the words of the title**
(`helper/friskyMatch.ts`):

- **artist key** — the name, normalised: `FRISKY | El Reyalto` and `El Reyalto` → `elreyalto`.
- **title key** — the title's words with the artist, the date, the part number, the
  `[vk.com/...]` suffix and the stopwords removed, sorted. Both sides reduce to `burly hurly`.
- **period** — the month. The episode's `air_start` is the authoritative date; the slug is the
  fallback when the search answer did not carry the episode.
- **score** — Jaccard over the title words; a same-month candidate gets
  `0.5 + 0.5 × similarity`, everything else the raw similarity, and `0.34` is the floor.

Two rules the tests refused to go without:

- **A minimum title overlap (0.2), always.** Without it the same-month bonus alone cleared the
  floor and `"Deep Blue Sessions August 2026"` matched `"Tech Coast Tribal - August 2026"` on
  the month.
- **The air date breaks ties.** Tech Coast Tribal is *weekly*: frisky lists four August 2026
  mixes with the same artist, title and month, and VK names none of them. Nearest to VK's upload
  time wins.

---

## Part D — Where it lives

Three tables (`1756600000000-FriskyCache`, `1756700000000-FriskyEpisodes`):

| Table | Holds |
|---|---|
| `vk_tracks` | the playlist as served: ids, artist, title, duration, VK upload date, artwork, the match keys, and the mix **and episode** it resolved to |
| `frisky_mixes` | one row per piece: genres, `track_list`, show, episode, air date |
| `frisky_artists` | bio, photo, genres, links — filled from search hits, not mirrored |

**`vk_tracks` has no `url` column, and must not grow one.** A VK audio link is signed for one
token, one device and a short life. Persisting it would hand out links that are dead on arrival
and would leak one user's signature to another. The stream is always re-read from VK — the cache
holds only what does not expire.

`frisky_mixes` likewise drops `mix_url` / `mix_url_64k`. frisky serves its own mp3s; the app
plays VK and only VK, and a second set of media links in the same row would only invite
something to play the wrong one.

---

## Part E — The loop

```
GET /api/playlist/frisky
   ├─ remember(raw VK items)      → vk_tracks   (before cleanupData: it strips the month,
   │                                             and the month is half the match)
   ├─ enrich(response.items)      ← the EPISODE's mixes + the artist
   └─ kick()                      → wake the worker, do not wait for it

worker (every 60s, and on every refresh)
   ├─ take 25 pending rows, grouped by SHOW — Part 1, Part 2 and every unresolved
   │  month of one programme are answered by one search
   ├─ /search?query=<artist> <title words>   → mixes + episodes + the artist record
   ├─ /mixes?artists_id={id}                 → the artist's whole run (24h TTL): search
   │                                            answers with at most `searchLimit` hits and
   │                                            a decade-old weekly show has hundreds
   ├─ match → vk_tracks.frisky_mix_id + frisky_episode_id
   └─ onEnriched(ids) → broadcastCatalog → every open socket
```

The whole feature is optional, the way Kafka and Postgres already are: with `DB_HOST` unset or
`FRISKY_API_ENABLED=false`, `remember()` and `enrich()` are no-ops and the playlist is served
exactly as VK sends it. frisky.fm being down never reaches a request — every call to it is made
by the background job, one at a time, 250ms apart.

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

## The bug worth remembering

**axios encodes a space as `+`, and frisky does not read `+` as a space.**

Its default parameter encoder ends with `.replace(/%20/g, "+")`. `?query=hurly+burly` answers
`{"Mixes":[],"Shows":[],"Episodes":[],"Artists":[]}` — HTTP 200, no error, no hint — while
`hurly%20burly` returns 30 mixes. So *every multi-word search found nothing* and every track was
filed as "frisky has never heard of this show". It looked exactly like a matching problem.

The client now sets `paramsSerializer: {encode: encodeURIComponent}`, and a test asserts a space
survives as `%20`. Worth remembering because the same class of bug already bit this codebase
once: `runVkSearch` has a comment about VK signing the decoded query.

---

## Also fixed

`formatPlaylist` had shipped two placeholders since the first milestone: a `genre_list` reading
`"Unknown Genre"` and a `track_list` holding one row of `{title: "string", artist: "string"}`.
The app rendered them as if they were real. Both are now empty arrays — a track nothing is known
about gets nothing — and `multipart` is read off the title instead of being hardcoded `false`.

---

## Verified

Against a throwaway Postgres container and the live frisky API:

- both migrations apply; `vk_tracks` has no url column
- five synthetic VK rows spanning both title shapes and 2007→2026 all matched at score 1.00,
  1055 mixes and 38 artists cached in 12s
- **`Hurly Burly … Part 1` and `Part 2` → the same mix and the same episode 73077**
- the tracklist is read off the episode: a row matched to mix 19066, which carries **0** tracks,
  is served the **25** tracks its sibling 12710 holds under episode 7486
- `air_start` survives the artist-paging pass (it did not at first: `/mixes` carries no episode
  records, so a plain upsert overwrote the search's dates with nulls)
- an artist frisky has never heard of → `unmatched`, served as VK sent it, retried in 6h
- 125 unit tests; `esbuild` bundle contains the new entities and both migrations

## Not done

- `part_list` is still a one-element stub built from the VK url (pre-existing `TODO`).
- Nothing in the UI *shows* the tracklist yet — `PlayerTrackListBar` still has
  `isHaveTrackList = false` hardcoded. The data now arrives; drawing it is next.
- Mixes whose episode has no tracklist anywhere on frisky stay empty. That is frisky's data.
- `Shows` and `Episodes` from a search answer are read for their air dates and titles but are
  not tables of their own; if show artwork or summaries are ever wanted, they will need to be.

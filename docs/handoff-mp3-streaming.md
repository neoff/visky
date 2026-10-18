# Handoff — why our streams break, and the mp3 lead

Written 2026-10-19, at the end of a long session, for the one that picks this up
with a fresh context. The next piece of work is **getting VK's mp3 stream
instead of its HLS one**; everything below is what is already known, already
fixed, and already ruled out, so none of it has to be rediscovered.

---

## The open problem

VK hands the same track out in two different shapes, and we are taking the
fragile one.

| | VK's own web player | our app |
|---|---|---|
| host | `psv4.vkuseraudio.**ru**` | `psv4.vkuseraudio.**net**` |
| url | `/s/v1/amp2/<hash>.mp3?siren=1` | `/s/v1/a2/<hash>/index.m3u8?siren=1` |
| transport | one file, byte ranges — **206 Partial Content** | HLS: manifest, `key.pub`, then `seg-NN-a2.ts` |
| where it comes from | `POST vk.ru/al_audio.php?act=start_playback` (web client) | `audio.get` / `audio.getById` with the Kate Mobile token |
| how it fails | once, at the start, visibly | mid-track: `seg-00` 200, `seg-01` 200, `seg-02` **503**, retry **404** |

Captured on 2026-10-18 in a browser, from the group page
`https://vk.ru/audios-42311167`, with the same account that the app uses.

The hashes and the path prefixes differ (`amp2` vs `a2`), so **one url cannot be
rewritten into the other** — they are separately signed objects. Getting the mp3
means getting it from VK, not deriving it.

### Why it matters

Every "the music stopped" report in this project traces back to a segment that
did not arrive. A progressive mp3 with Range requests has one failure point at
the start; the HLS chain has one per segment, and VK's CDN is currently
unreliable enough that a show rarely survives an hour.

### Where to look first

* `api/src/helper/vk.ts` — `vkMethod`, and the request signature
  (`sig = md5(url + secret)`, `device_id` is part of it). Whatever call returns
  the mp3 will have to be signed the same way.
* `api/src/router/api/playlist.ts` — `getPlaylistData` calls `audio.get`, and
  `formatPlaylist`/`cleanupData` shape what the app receives. The url the app
  plays is whatever lands in `TrackItem.url` here.
* `app/src/services/*` — the app plays it as `TrackType.HLS`. A progressive mp3
  would be `TrackType.Default`, and the web player (shaka) would stop being
  involved at all on the desktop, which removes a whole class of the problems
  fixed this week.
* Questions worth answering in that order: does `audio.get` return an mp3 url
  for a different `v=` or a different client token? Is `al_audio.php` reachable
  with the credentials we hold (it is a web-session endpoint, not an API one)?
  What does `siren=1` mean — it is present in both forms?

---

## What is already fixed (do not re-diagnose)

All of these are committed and pushed; several were mistaken for each other
during the session, which is why they are written down.

| Commit | What it fixed |
|---|---|
| `5caa930` | Release builds baked `http://localhost:3000` — `EXPO_PUBLIC_API_URL` now wins over `app/.env`, and every build script exports it. This froze the desktop playlist on 16.09 for ten days. |
| `29cb909` | ⏭ played the PREVIOUS track: deliberate switches now take the session's claim (`runLocalAction`) — buttons, lock screen, watch, car. |
| `638ed1b` | A tap started the wrong track: the web player's `reset()` kept its index, so `add()` loaded nothing and `play()` resumed the old element. |
| `6536aa3` | Sound stopped seconds in: a tap on the track the session already named was never announced, the claim lapsed, the reconciler paused the device. |
| `8b10225` | QR login did not stick: a revoked device was bricked, not signed out. A pairing now lifts the revocation (server side, live since 1.5.55). |
| `20d9ce3` | A shaka error never became a `PlaybackError`, so recovery never ran on desktop; and the state after buffering lied "paused" while playing. |
| `dcc2231` | A tap on a row with no stream did nothing at all — not even the spinner. It now asks the API for a fresh url first. |
| `5f9f528` | A track that cannot be played is left behind and the next one starts, like VK's player. Bounded: three skips per thirty seconds. |
| `490d67c` | `make install` printed "installed" when it had not installed anything (the MAS copy in /Applications is root-owned). |
| `eadab16` | The desktop window remembers where it was left. |

Issue #5 on GitHub ("song stops in the middle") is effectively closed by
`20d9ce3` + `5f9f528` but has not been closed or commented on yet. #4 and #7 are
closed. #6 (seek) is open pending confirmation.

---

## State of the world

* **api** — `varg/visky-api:1.5.56`, rolled out, pod healthy.
* **macOS desktop** — 1.5.56, Developer ID, notarised, installed in
  `/Applications`. It does **not** yet carry `dcc2231`, `5f9f528` (built before
  them).
* **iOS** — 1.5.53 (12) in TestFlight. **Android** — versionCode 102 on the Play
  internal track. Both are behind by every fix after 05.10.
* **App Store / Mac App Store** — 1.5.53, `READY_FOR_SALE`. Nothing newer
  submitted.
* **Web player** — deliberately parked, see the memory note. `/player` 404 is
  expected.
* Working tree: clean except the user's own in-progress files (`Makefile`,
  `scripts/README.md`, `scripts/submit-store.sh`, `scripts/lib/asc-*.js`,
  `release-notes.md`).

## Environment facts worth not rediscovering

* **Builds** run in background Haiku subagents, one pipeline each, and their
  reports are claims — verify from the source (`kubectl`, `spctl`,
  `next-build-number.js`, a grep of the shipped bundle). Two agents this session
  reported success for things that had not happened.
* `make api` needs Docker Desktop running; it checks before bumping, so a failed
  run leaves the version alone.
* **The adb-over-wifi phone** (`192.168.1.234:5555`, SM-N950F, rooted) needs two
  things on this Mac: Tailscale with `--accept-routes=false` (a tailnet node
  advertises `192.168.1.0/24` and swallows the LAN), and **Local Network
  permission for iTerm** — without it every non-system binary, adb included,
  gets `EHOSTUNREACH` while `ping` works.
* **Debugging the desktop build** without devtools: export the bundle, serve
  `desktop/web` with `python3 -m http.server 8099`, open it in the controlled
  Chrome. The API's CORS reflects any origin, `window.rntpPlayer` is the live
  player (set by our patch), and `read_console_messages` /
  `read_network_requests` show everything the Tauri shell hides. This is how the
  503s were caught. One caveat: that tab registers as another device in the
  playback session and will fight the real app — close it when done.
* **api logs print VK tokens and the audio `secret` in clear text**. They leaked
  into this session's transcript twice. The account's VK sessions should be
  ended, and the logger should redact the way `app/src/helpers/network.tsx`
  already does.

## Still open

1. The mp3 lead above.
2. Phones are two weeks behind; `6536aa3` and the pairing fix matter to them.
3. Stores are on 1.5.53.
4. The api log redaction.
5. A refresh that fails still shows a stale list in silence
   (`useWindowedTracks.reset()` swallows the error) — this is what disguised the
   revoked device as "the playlist is frozen".

# Handoff — why our streams break, and the mp3 lead (closed)

Written 2026-10-19, at the end of a long session, for the one that picks this up
with a fresh context. The mp3 lead that gave this file its name was chased down
on 2026-10-19 and **closed** — the section below says what it turned out to be,
so it does not get re-opened. Everything after it is what is already known,
already fixed, and already ruled out.

---

## The mp3 lead — closed, and what it actually was

The premise in the first draft of this file was wrong. It said VK's own web
player streams a progressive `amp2/<hash>.mp3` with byte ranges while we get
HLS. Measured in the controlled browser on `vk.ru/audios-42311167`, with the
same account, VK's web player requests exactly what we do:

```
psv4.vkuseraudio.ru/s/v1/a2/<hash>/seg-NN-a2.ts?siren=1   → 200
```

No `.mp3` request at all, for any track played. `a2` → `amp2` is not a rewrite
that exists: those paths answer 404 and 418.

### What the segments really contain

A `.ts` segment demuxed by hand (ES on PID 256) begins `FF FB E2 44` —
**MPEG-1 Layer III, 320 kbps, 44.1 kHz**. VK slices a finished mp3 into a TS
container; it is not AAC and there is no transcode anywhere in the chain.
Concatenating the elementary streams of seg-00..02 of one `ac` track yields a
file `file(1)` calls `MPEG ADTS, layer III, v1, 320 kbps, 44.1 kHz, Stereo`,
carrying an ID3v2.4 tag and a Xing/Info header, 995 frames, 25.99 s against the
manifest's 25.97 s.

So the mp3 exists, but only as the segments themselves. Obtaining it means
downloading them and stitching them somewhere. That was weighed and
**declined**: the API hands out links, it does not carry audio. No segment
proxy, no server-side stitching, no `/stream/*.mp3` endpoint.

### The two url families

`audio.get` returns, for the 98 tracks of the group:

| family | host | count | note |
|---|---|---|---|
| `/s/v1/ac/` | `cs9-*`, `cs1-*` | 54 | `EXT-X-KEY` AES-128 on **seg-00 only**, then `METHOD=NONE`; key at `.../key.pub?siren=1`, IV = 0 |
| `/s/v1/a2/` | `psv4` | 39 | no key, clear from the first segment |
| — | — | 5 | empty `url` — the dead tracks `5f9f528` skips past |

### What was ruled out while closing it

* **`.net` vs `.ru` is nothing.** Both resolve to `ps.userapi.com`
  (`87.240.190.76`, `87.240.190.89`); the signed hash is host-agnostic — a hash
  minted for the web on `.ru` serves from `.net` and the other way round. A fair
  interleaved sweep of cold segments on both hosts: 60/60 × 200, no difference.
  The earlier asymmetry was a cold cache and a transient.
* **Stale urls are not the failure.** The urls sitting in the desktop app's
  mmkv (`mmkv.playlist.songs-window`, 12 h old) still answer 200, manifest and
  segments alike. The signature outlives a listening session.
* **The CDN was healthy on 10-19.** A freshly minted `ac` track, swept from the
  user's own network: 182/182 segments 200, none slower than 2 s. From a
  different network the same day, single segments stalled past 20 s and then
  answered 200 — the same shape as the 503s of 10-18, i.e. VK's edge having a
  bad spell rather than a standing condition.
* **The API calls need the Android UA.** `VKAndroidApp/4.13.1-1206 (...)`, which
  `AndroidClient` already sends. The identical signed request with a Kate Mobile
  UA comes back `error 8 Invalid request` — worth knowing before blaming the
  signature.

### What is left of the problem

Every "the music stopped" report is still a segment that did not arrive, and
the remedy left on the table is **client-side**: segment retry and timeout
policy in shaka (desktop) and in ExoPlayer / AVPlayer (phones), on top of the
recovery that `20d9ce3` and `5f9f528` already added. Nothing about the url
shape will help, and the API's part of this is finished.

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

1. Segment retry/timeout policy on the clients (the mp3 lead above is closed).
2. Phones are two weeks behind; `6536aa3` and the pairing fix matter to them.
3. Stores are on 1.5.53.
4. The api log redaction.
5. A refresh that fails still shows a stale list in silence
   (`useWindowedTracks.reset()` swallows the error) — this is what disguised the
   revoked device as "the playlist is frozen".

# 02 — Cross-device playback ("Connect")

Full record of the milestone, so the work can be resumed. Started 2026-08-25, the day
milestone 01 closed.

A track started on one device continues on another from the same second; the sound stops on
the one it came from. The app, killed from memory and opened again, comes back on the last
track that played — on any device.

---

## Goal

1. **Transfer.** A device icon in the mini player, a picker behind it, tap = the sound moves.
   Spotify Connect, in other words.
2. **Timing.** The receiving device continues at the right second, not at the start.
3. **Restore.** A cold start selects the last track that played anywhere.
4. **Research the transport** (the ask was explicit): Kafka is already up locally and in the
   cluster — is it the channel? MQTT? A push?

---

## Part A — Research: what actually carries a transfer

The answer decides the whole shape, so it came first.

| | Can it be the device-facing channel? |
|---|---|
| **Kafka** | **No.** A consumer needs a stable TCP connection to the broker, joins a group, rebalances; there is no mobile client and the broker cannot be exposed to the internet. Kafka is a bus *between backends*. |
| **MQTT** | Technically yes — this is its scenario (flaky mobile links, QoS 1, LWT, tiny footprint). But it means a new broker, a bridge from our `x-auth-*` credentials into its auth, and another native dependency in the app. Against WSS it wins nothing at this scale. |
| **Silent push (FCM/APNs)** | **Not a channel.** iOS never wakes an app the user force-quit; Apple's own guidance is no more than 2–3 background pushes an hour, and it may throttle or drop them; audio cannot be started from a background notification; delivery is unordered and can lag by seconds. |
| **WebSocket in `visky-api`** | ✅ Rides the existing traefik TLS ingress, authenticates with the same `x-auth-*` headers as REST, tens of milliseconds. It is also how Spotify Connect works: a persistent socket per active device, the server pushes state. |

**Decision — hybrid.** WSS carries state and timing. The silent push is a doorbell only: it
wakes a device whose socket has died so it reconnects and *pulls* the state itself. Kafka is
the internal bus and the store of record.

### The honest limitation

A transfer target has to be reachable: the app in the foreground, or in the background **and
playing** (iOS keeps the process alive under `UIBackgroundModes: audio`, Android under
RNTP's foreground service). An app swiped away cannot be made to play by anything — so the
picker greys it out. Its last position is not lost: it restores the moment the user opens the
app there. Spotify behaves the same way; offline devices are not targets.

### Infrastructure found

* Local: `kafka` (cp-kafka 7.9.5) on `localhost:29092`, `postgres:17` on `localhost:5432`.
* Cluster `oracle`: `kafka-kafka.default.svc.cluster.local:29092` (ns `default`),
  `postgres-postgres.database.svc.cluster.local:5432` (ns `database`), `visky-api` 1 replica
  in ns `frisky` behind traefik with TLS on `frisky.envarg.com` — so `wss://` works with no
  extra configuration.
* `api/src/router/api/player.ts` was a stub: `PATCH /:user_id/:owner_id/:id` accepted
  `{device_id, status}` and never even answered. `typeorm.config.ts` existed but pointed at a
  `src/db/entities/**` that did not exist — nothing was ever persisted.

---

## Part B — The model

### Position is a function, not a number

`position_ms` is the position that was true at `updated_at_ms` **on the server clock**. "Where
is it now" is `position_ms + (now - updated_at_ms)` while playing, clamped to the track length.
The receiving device seeks to a number the *server* computed, so no phone's clock skew can
leak into a transfer. Devices learn the server clock from every frame plus a ping/pong pair,
keeping the sample with the smallest round trip (a slow exchange says nothing about clocks).

### `version` decides

Monotonic per user. An update carrying an older version is a straggler from a device that has
not caught up and is dropped. Progress ticks do *not* bump it — they refresh the same revision
— so a device mid-transfer never sees a version race. This is also what makes the Kafka
loopback harmless: our own record comes back and is ignored.

### A transfer carries ids, never a URL

VK signs the HLS link for the requesting session, so the target has to ask for its own copy:
`GET /api/player/track/:owner_id/:id` returns a playlist-shaped item built from
`audio.getById`.

### One id for the device

The `device_id` the app already persists for VK (it is part of the signed audio request) is
also the playback device id. Nothing new had to be provisioned to make a phone a target.

---

## Part C — API

```
device ──WSS /api/player/ws──> visky-api ──> Kafka  visky.playback.state.v1  (compact, key=user_id)
                                    │              visky.playback.events.v1  (retention 7d)
                                    ├──> Postgres  users / devices (+ push_token)
                                    └──> Expo Push (wake only)
```

| file | what it owns |
|---|---|
| `src/types/playback.ts` | the wire contract: state, update, device info, event, frames |
| `src/services/playback.ts` | the session: version, projection, transfer, freeze-on-disconnect |
| `src/services/kafka.ts` | topics, producer, boot replay, fan-out to other replicas |
| `src/services/devices.ts` | device registry (Postgres + in-memory presence) |
| `src/services/wake.ts` | the doorbell (Expo Push), rate-limited per device |
| `src/services/session.ts` | socket credential verification against VK, cached 10 min |
| `src/ws/hub.ts` | the socket: rooms per user, heartbeat, broadcast |
| `src/router/api/player.ts` | REST: the cold path and the socket-less fallback |
| `src/db/entities/*`, `src/db/migrations/*` | `users`, `devices` |
| `src/configurations/playback.ts` | every knob, all optional |

### Kafka as the store of record

`visky.playback.state.v1` is **log-compacted and keyed by `user_id`**: the newest snapshot per
user lives forever, so a booting replica rebuilds the whole world by reading the topic from the
beginning. `whenReplayed()` gates the REST handlers so a cold replica never answers "nothing is
playing". The consumer takes a **fresh group id per boot** — it is a materializer, not a worker
pool: every replica must see every record, not a share of them.

`visky.playback.events.v1` is the append-only history (what played where), 7 days.

Devices never talk to Kafka.

### Degradation is deliberate

With `KAFKA_BROKERS` unset the state lives in this process; with `DB_HOST` unset the device
registry does. Both log a warning and the feature still works — it just stops surviving a
restart and stops fanning out. Tests and a bare `yarn dev` need no infrastructure.

### Socket auth

REST proxies everything to VK, so a forged `user_id` there buys nothing. The playback state is
*ours* — a socket claiming someone else's id would read and steer their session. So the token
is checked once per connection (`users.get`) and cached for 10 minutes;
`PLAYBACK_TRUST_HEADERS=true` skips it for local work.

### Endpoints

| | |
|---|---|
| `GET /api/player/state` | the whole session + devices + `position_now_ms` (cold start) |
| `PUT /api/player/state` | what this device is playing (socket-less fallback) |
| `GET /api/player/devices` | the picker's list |
| `POST /api/player/devices` | register a device and its push token |
| `POST /api/player/transfer` | hand the sound over |
| `GET /api/player/track/:owner_id/:id` | re-resolve a track for THIS session |

The legacy `PATCH /:user_id/:owner_id/:id` is now a thin wrapper over the same state instead of
a handler that hangs.

### Edge cases that are not obvious

* **The active device's socket dies.** A network hiccup is not a pause: nothing happens for 45 s.
  If it stays gone, the position is frozen where it *would* be by then and `playing` goes false
  — another device must be able to pick the track up at the right second.
* **The API restarts.** After the replay, every restored session that claims to be playing gets
  that same grace period (`guardRestoredSessions`): the devices have 45 s to reconnect and start
  reporting, otherwise the position freezes. Without it a restored "playing" state with no
  sockets would project forever.
* **Play pressed on a passive device.** That is a takeover — it reports a track and becomes
  active, no explicit transfer needed.

---

## Part D — App

| file | what it owns |
|---|---|
| `src/services/playbackSync.ts` | the socket: backoff, AppState reconnect, clock offset |
| `src/services/playbackReconciler.ts` | makes the local player agree with the session |
| `src/services/pushWake.ts` | push token + wake handling, native modules optional |
| `src/store/playback.tsx` | zustand state, devices, offset, MMKV mirror |
| `src/hooks/usePlaybackSync.tsx` | wiring: what gets reported, and by whom |
| `src/components/DevicePicker.tsx` | the "Play on" sheet |
| `src/components/FloatingPlayer.tsx` | cast icon + "Playing on …" line |
| `src/helpers/device.ts` | the installation's id |
| `src/types/playback.ts` | hand-written mirror of the API contract |

### Who is allowed to report

Only the device that owns the sound, plus any device the user starts a track on (which is how
pressing play here takes the sound away from there). Everything the reconciler does to the
player is flagged, so applying a transfer never bounces back up and fights the transfer itself.

### Restore

Three paths, and only one of them ever plays:

* the session says this device is active → load, seek to the *projected* position, match play/pause;
* the session says another device is → pause, but still put the track on screen so the mini
  player can say where it is playing;
* nothing is active → restore the last track, **paused**, at the position it was left at.

A fourth, before the socket is even up: the cached snapshot from MMKV is restored (always
paused) so the mini player is populated immediately.

---

## Part E — `device_id` for sessions that never had one

Logins created before the app kept an id have no `device_id` in storage, so they could not be
addressed by a transfer at all. They are not asked to log in again:

* `helpers/device.ts` owns the id (SecureStore, same 16-char alphabet as the backend's
  `deviceIDgen`, memoised so parallel callers cannot mint two);
* `SessionProvider` adopts it on launch and writes it back into the stored session;
* `setAuthHeaders` fills the header immediately, without waiting for that storage round trip,
  so even the first playlist refresh or token refresh of the launch identifies the device;
* `login.tsx` lost its private copy of the generator and uses the helper.

SecureStore survives app updates (keychain / keystore-backed) — only a reinstall mints a new id.
VK only needs the id to be *consistent*; the backend used to invent a fresh one per request when
it was missing, so a stable one is strictly better.

---

## Bugs found by running it

The ones worth remembering, with their root causes.

1. **Every player REST test hung, none of the playlist ones did.** The test's fake
   `checkAuthAndroid` did `req.session = {...}` — replacing the express-session object with a
   plain one. At response end, `express-session` calls `req.session.save()`, which no longer
   existed, and the response never finished. `Object.assign(req.session, ...)` instead.
2. **The socket integration test timed out on the first transfer.** `__resetPlayback()` cleared
   the listener set — and the hub subscribes exactly once, at attach time, so resetting the
   sessions silently unplugged every broadcast. Reset now leaves subscribers alone.
3. **A device that reported playback did not appear in the picker.** `PUT /state` never touched
   the registry. A `rememberDevice` middleware now marks every player call as a sign of life.
4. **After a REST transfer the app could not name the new device.** Only the state was
   broadcast, never the roster, so the picker's list was the one from `hello` time. The REST
   routes now call `refreshDevices()`, and `useRemoteDevice` falls back to a nameless stand-in
   so the user is told the sound moved even before the roster catches up.
5. **"Maximum update depth exceeded" in `FloatingPlayer`.** That stand-in was *built inside* a
   zustand selector — a new object every render, so the store re-rendered for ever. Select
   primitives, build in `useMemo`.
6. **A red box on a build without `expo-notifications`.** `require()`ing it throws from inside
   the module's own initialisation ("Cannot find native module 'ExpoPushTokenManager'"), which a
   try/catch around the require does not reliably contain. Probe the native runtime first with
   `requireOptionalNativeModule` and only then require the JS. This matters beyond development:
   an OTA update landing on an older binary must keep playing music.
7. **A cold start stole the sound from the device that was playing.** Restoring the track fires
   `PlaybackActiveTrackChanged`, and the native player reports it well after our "applying"
   window closed, so it read as "the user started this". Two fixes: the window went to 1.2 s,
   and a passive device now ignores that event when the track is the session's own. A real tap
   on the same track still takes over — it also starts playback, which the state handler sees.
8. **A transfer arrived, the track loaded, and then nothing played.** `getPlaybackState()` says
   `Buffering`/`Ready` right after `add()`, which the code read as "already sounding", so the
   `play()` that actually starts it was never sent — and five seconds later the progress
   heartbeat reported `playing: false` and paused the whole session. `getPlayWhenReady()` is the
   *intent* and is stable across buffering; everything now reports and compares that.
9. **A cold start loaded the track twice and fired `ended` on a track nobody finished.** The
   cached restore and the first socket frame both load, milliseconds apart, each resetting the
   queue under the other. Reconciler operations are serialised through a promise chain; the
   second one finds the track already loaded and does nothing.
10. **A restored session projected past the end of the show.** A state that claims to be playing
    while nobody reports (the API restarted) grows without limit. The projection is clamped to
    the track length, and `guardRestoredSessions` freezes it after the grace period.
11. **`CreateTopics` logged an error on every boot after the first.** kafkajs reports
    `TOPIC_ALREADY_EXISTS` at ERROR level. `listTopics()` first, create only what is missing.

---

## Verification

**Unit / integration — `api`: 89 tests, 11 suites, green.** Includes a real socket test (two
devices of one account, a transfer, the roster, the ping/pong clock, and a 401 for a socket with
no credentials) and the REST suite.

**Against real infrastructure** (docker Kafka + Postgres, API restarted mid-test):

* the compacted topic was created with `cleanup.policy=compact`, 3 partitions;
* two virtual devices transferred a track and the position advanced by exactly the elapsed time
  (125.0 s → 126.2 s after ~1.2 s);
* **the API was killed and restarted** — `GET /state` came back with the same track, device and
  `version` from the compacted topic, and the device list from Postgres.

**On the Android emulator, against the local API** (`emulator-5556`, real VK session):

| # | what | result |
|---|---|---|
| 1 | tap a track | session records track, position, `context: frisky` |
| 2 | transfer away | emulator pauses, mini player shows the cast icon in red and "Playing on …" |
| 3 | transfer back (parked at 900 s) | loads, seeks to 904 s (900 + flight), plays |
| 4 | force-stop → relaunch | last track restored **paused**, the other device's session untouched |
| 5 | tap the session's track while passive | takeover: active moves here, plays |
| 6 | open the picker | "Play on" lists this device ("Playing here", red) and the other, greyed with "Last seen 2 min ago" |

### Not verified

* **The silent push.** Needs a new native build (`expo-notifications`, `expo-task-manager` and
  `remote-notification` in `UIBackgroundModes` were added) plus FCM credentials for Android and
  an APNs key for iOS in EAS. Without them a device simply cannot be woken; everything else works.
* **iOS.** The logic is shared, but the simulator takes no touch injection (see the project
  memory), so nobody has tapped it there.
* **Multi-replica fan-out.** Written and exercised in one process; `visky-api` runs 1 replica.

---

## Files touched

**API** — new: `configurations/playback.ts`, `db/entities/{User,Device}.ts`,
`db/migrations/1756100000000-PlaybackDevices.ts`, `services/{playback,kafka,devices,wake,session}.ts`,
`ws/hub.ts`, `types/playback.ts`, `__tests__/services/playback.test.ts`,
`__tests__/router/api/player.test.ts`, `__tests__/ws/hub.test.ts`.
Changed: `router/api/player.ts` (stub → the feature), `index.ts` (socket + init + graceful
shutdown), `configurations/typeorm.config.ts` (env-driven, explicit entities — a `src/**` glob
resolves to nothing inside the esbuild bundle), `tsconfig.json` (`experimentalDecorators`;
`emitDecoratorMetadata` deliberately off, because esbuild cannot emit it — every column carries
an explicit `type`), `package.json` (`kafkajs`, `ws`), `README.md`.

**App** — new: `services/{playbackSync,playbackReconciler,pushWake}.ts`, `store/playback.tsx`,
`hooks/usePlaybackSync.tsx`, `components/DevicePicker.tsx`, `helpers/device.ts`,
`types/playback.ts`.
Changed: `components/{FloatingPlayer,SessionProvider}.tsx`, `helpers/network.tsx`,
`constants/index.ts` (ws url + player endpoints), `app/(app)/_layout.tsx`,
`app/(auth)/login.tsx`, `app.json` (`expo-notifications`, `remote-notification`).

---

## Rules to keep (do not regress)

1. **Never make the push the channel.** It cannot start audio and it is throttled. State travels
   over the socket; the push only shortens the wait for it.
2. **Never send a stream URL between devices.** VK signs it per session — send ids.
3. **Only the active device reports position.** A passive device that is still ticking would drag
   the session backwards.
4. **Compare and report `playWhenReady`, not the playback state.** Buffering is not playing, and
   `Ready` is not paused.
5. **Everything the reconciler does to the player must be flagged and serialised.** Otherwise the
   player's own events come back up as user intent, and two loads race.
6. **The state topic must stay `cleanup.policy=compact`.** It is the store of record; deleting
   old segments deletes sessions.
7. **The API must keep starting without Kafka and without Postgres.** Tests and local work depend
   on it.

---

## Deployed — 2026-08-26 (api 1.5.36)

Credentials come from **Vault**, not from the k8s Secret — the same shape `crypto-bits-api` uses.
The agent injector writes each secret to its own file under `/vault/secrets/` and the pod is told
where with `<NAME>_FILE`; `secret()` in `configurations/playback.ts` reads the file when it is set
and readable, and otherwise falls back to the plain env var (local runs, docker-compose, the tests).
A missing or empty file falls back rather than throwing, so a pod that starts before the agent has
written its files boots memory-only instead of crash-looping.

What was put in place:

1. **Postgres role `visky`** — its own login, owner of database `visky` and of its `public` schema
   (Postgres 17 does not let a non-owner create tables in `public`). The superuser password never
   leaves the `database` namespace.
2. **Vault KV**: `secret/database/visky/api` → `username`, `password`;
   `secret/visky-api/kafka` → `brokers`. The kubernetes auth role `visky-api` and the
   ServiceAccount `visky-api` in ns `frisky` already existed, unused, from 262 days ago.
3. **Deployment patch** — `api/k8s/deployment.vault.patch.yaml`, the record of the Vault half of a
   Deployment that is otherwise edited in place and templated nowhere. Non-secret coordinates
   (`DB_HOST`, `DB_PORT`, `DB_NAME`) stay as plain env; only the credentials come from Vault.
4. **`CREATE DATABASE visky`** was already done — migrations ran themselves on boot and created
   `users`, `devices`, `migrations`, all owned by `visky`.

Verified on the live pod: `/vault/secrets/{db-user,db-password,kafka-brokers}` are present,
`==playback: postgres connected (…/visky)`, `==playback: created kafka topics
visky.playback.state.v1, visky.playback.events.v1`, `kafka state replay complete`, `kafka
connected`. The state topic came out with `cleanup.policy=compact` (rule 6). `/health` is 200 on
both hosts and the socket answers `401` to an unauthenticated upgrade over HTTP/1.1, i.e. traefik
passes the upgrade through and the API rejects it.

Still open: a real two-device transfer against **prod** has not been run — the emulator here points
at the local API, and the store build that points at prod is the one Google Play is rolling out.

---

## Open questions

1. **The queue does not travel.** `context` (which list, which index) is recorded in the state
   but the receiving device only loads the single track, so *next* after a transfer plays from
   whatever list that device has open, not the source's queue.
2. **No remote control.** Play/pause/seek *on another device* was deliberately left out of v1.
   The picker moves the sound here and then controls it locally; steering a remote device would
   need a `command` frame the protocol does not have yet.
3. **Offline cold start shows nothing.** The cached snapshot is there, but resolving the stream
   needs the network, so with no connection the mini player stays empty.
4. **Device names come from `Constants.deviceName`.** A device that has a session but has never
   run this build has no name and shows as "Unknown device".
5. **A revoked token keeps its socket for up to 10 minutes** — the verification cache TTL.
6. **Devices are never pruned.** A phone that was signed in once stays in the list for ever.
7. **`api/package-lock.json` churned** (~3.9k lines) because the new deps went in with npm while
   `yarn.lock` also exists in the tree. Both lockfiles carry `kafkajs`/`ws`, but the repo should
   pick one.

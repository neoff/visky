# visky

A player for the [FRISKY Radio](https://www.frisky.fm/) archive that lives in VK
audio: the group has uploaded years of shows, VK can play them and knows almost
nothing about them, and frisky.fm knows everything about them and cannot play
them. visky joins the two and puts the result on a phone, a watch, a car
dashboard, a Mac and a browser.

```
                      ┌──────────────┐
   VK audio  ────────▶│              │◀──────── frisky.fm /v3
   (the files,        │     api      │          (shows, tracklists,
    signed urls)      │  Node/Express│           genres, DJ photos)
                      │  + Postgres  │
                      └──────┬───────┘
                             │  REST + a playback socket
        ┌────────────┬───────┴───────┬──────────────┐
      phone        watch/car       desktop         web player
   (iOS+Android)  (CarPlay,      (Tauri, macOS)   (same bundle,
                  Android Auto)                     nginx image)
```

One React Native source produces every client. The API holds the only secrets,
the only database and the only version number.

## What is in here

| Directory           | What it is                                                                 |
|---------------------|----------------------------------------------------------------------------|
| `api/`              | Node/Express + TypeORM/Postgres. VK auth, playlists, favourites, the frisky.fm metadata cache, the playback socket. Ships as the `varg/visky-api` Docker image to Kubernetes. |
| `app/`              | Expo / React Native: the phone app, the watch app and the CarPlay / Android Auto trees. Exported for `web` it is also the desktop and browser player. |
| `desktop/`          | The macOS shell: a Tauri (WKWebView) wrapper around the exported web bundle, plus the Mac App Store variant. ~16 MB. |
| `desktop-electron/` | The Electron shell Tauri replaced. Still builds, still ~296 MB, kept as a fallback. |
| `web/`              | The browser player: the same bundle under `/player`, packed into an nginx image. It cannot log in to VK — a phone hands it a session. |
| `scripts/`          | Every build, release and deploy. See [scripts/README.md](scripts/README.md) and the `make` table below. |
| `qa/`               | The test matrix that runs on real surfaces — emulators, a physical iPhone, the desktop shell. [qa/TESTCASES.md](qa/TESTCASES.md) |
| `docs/`             | One document per milestone: what was wrong, what was done, what it cost. |
| `certs/`            | Local credential material. Gitignored, never committed.                    |

## Commands

Everything goes through the root `Makefile`, which is a dispatcher over
`scripts/`. `make help` prints the same list with every flag.

Flags are make *goals*, not options, so they need either a lone `--` first or no
dashes at all — all three of these are the same command:

```bash
make desktop -- --dmg --install
make desktop dmg install
make desktop EXTRA="--dmg --install"
```

Values that are not switches are variables: `ARCH`, `TRACK`, `BUILD`, `TAG`,
`PROFILE`, `API_URL`.

### API

```bash
make api                        # bump the patch version, build + push the image, deploy to k8s
make api -- --no-deploy         # build + push only
make api -- --no-bump           # reuse the version in api/package.json
make api -- --bump-minor        # or --bump-major
make api redeploy               # roll the CURRENT version out again — and if that tag is not
                                # on Docker Hub, build it from this tree and push it first
make deploy-api TAG=1.5.52      # deploy one tag, nothing else
```

### App — four destinations, one source

```bash
make ios                        # EAS cloud build -> App Store Connect (TestFlight)
make ios -- --local             # xcodebuild here -> App Store Connect, no EAS in the path
make ios -- --no-submit         # build only (the local build keeps the .ipa)
make ios -- --submit-last       # submit the last EAS build without rebuilding

make android                    # EAS cloud build -> Google Play, internal track
make android -- --local         # gradlew + the Play API here, no EAS
make android -- --local TRACK=alpha

make desktop                    # signed .dmg + .pkg (Tauri, Developer ID), arm64
make desktop -- --dmg           # one target instead of both
make desktop ARCH=universal     # or arm64 (default), or x64
make desktop -- --run           # launch it locally, package nothing
make desktop -- --install       # ...and copy the built .app into /Applications
make desktop -- --skip-bundle   # reuse desktop/web, rebuild the shell only
make desktop -- --mas           # the Mac App Store build instead (desktop/dist-mas)
make desktop -- --upload        # ...and upload it to App Store Connect
make desktop -- --electron      # the old Electron shell
make install                    # install the newest already-built .app

make web                        # export the player, build + push the nginx image
make web -- --deploy            # ...and roll it out
make web -- --serve             # export and serve it on :8081, package nothing
make web -- --local             # build the image, do not push
make deploy-web TAG=1.5.52

make app desktop                # `app <platform>` is the same as `<platform>`
```

### Everything else

```bash
make version                    # write the api version into every frontend
make version-check              # report drift, write nothing, fail if any
make test                       # api jest --coverage, then app jest
make lint                       # eslint over both
make deps                       # npm install in api and app
make dev-api                    # tsx watch src/index.ts
make dev-app                    # expo start
make scripts                    # what each script in scripts/ is for
make -n <target> ...            # print what would run, run nothing
```

`make -n` is worth knowing: a release build signs, uploads and deploys, and
printing the command first costs nothing.

## Two things that bite

**The version comes from the API, for every client.** `api/package.json` is the
single source; `scripts/sync-version.sh` writes that number into the app, both
desktop shells and the web image. A desktop build that jumps `1.5.40 → 1.5.48`
with no desktop commits is the intended reading: same app, newer backend
contract. Build scripts run the sync (or `--check` and refuse on drift) so a
release cannot package a stale number.

**A release build must never bake in a developer's API host.** `app/.env` holds
whatever server you are pointing at today, and `EXPO_PUBLIC_API_URL` — set by
`eas.json` and by every `scripts/build-*.sh` — overrides it. Without that, a
shipped client fails every request in silence and shows whatever it had cached:
the desktop player once sat on a week-old playlist that way, with no visible
error anywhere. Build against something else deliberately:

```bash
API_URL=http://192.168.1.5:3000 make desktop
```

## Accounts, and which store wants which

Two Apple-side things and one Google-side thing, and they are not
interchangeable:

* **iOS / App Store Connect / Developer ID signing / notarisation** —
  `en.varg@me.com`, team `N853W9Q344`. Automated with an App Store Connect API
  key (`~/apple-signing/AuthKey_PNX776L4UV.p8`), so the release scripts run
  unattended: no 2FA prompt.
* **Android / Google Play** — `en.varg@gmail.com`, uploaded with a
  service-account JWT.
* A `--local` Android build needs **JDK 17**; anything newer breaks CMake.

[scripts/README.md](scripts/README.md) has the full requirements, where each
credential lives and how to replace it.

## Deploying

[docs/deploy-process.md](docs/deploy-process.md) — releases are run through
subagents, one per pipeline, so the four can run at once and the main session
does not fill up with build logs. It also says what an agent may decide on its
own and what it must come back and ask about.

## The record

One document per milestone, in order. They are written to be read after the
fact — what was broken, what was tried, what the fix cost:

* [00 — Login / VK audio auth](docs/00-login-milestone.md) — why only the direct password grant returns an audio-capable token
* [01 — Design parity, favourites, search, playback](docs/01-milestone-design.md)
* [02 — Cross-device playback ("Connect")](docs/02-connect-milestone.md)
* [03 — The frisky.fm metadata cache](docs/03-frisky-metadata-milestone.md)
* [04 — The macOS desktop player](docs/04-desktop-milestone.md)
* [05 — Second screens: the wrist and the car](docs/05-car-milestone.md)
* [06 — Pairing: signing in a screen that cannot log in](docs/06-pairing-milestone.md)
* [07 — Onto real hardware, and what broke on the way](docs/07-devices-milestone.md)
* [08 — The desktop, made usable, then rebuilt on Tauri](docs/08-desktop-tauri-milestone.md)
* [09 — Listening to it for an evening, and building something that can prove it](docs/09-listening-milestone.md)
* [10 — What a heart means, and where the picture comes from](docs/10-favorites-milestone.md)

QA: [qa/TESTCASES.md](qa/TESTCASES.md) is the matrix (every case names the proof
it needs), [qa/SCREENSHOTS.md](qa/SCREENSHOTS.md) the visual record.

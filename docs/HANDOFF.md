# Handoff — 2026-11-02

Written to hand the thread to a session with a clean context. Everything below
was verified against the live systems on the day, not recalled.

Repo version: **1.5.59** (`api/package.json`, synced across every frontend).

---

## Where the three stores stand

| | state | detail |
|---|---|---|
| **macOS 1.5.59** | `READY_FOR_SALE` | live since 1 Nov |
| **iOS 1.5.59** | `WAITING_FOR_REVIEW` | build 13, submitted 1 Nov 07:30 UTC. Not rejected — item is `READY_FOR_REVIEW`, no messages from Apple. Only Apple moves it; expedited review is a separate manual form. |
| **Android 1.5.59** (vc 103) | internal + closed testing | **cannot reach production yet** |

### Why Android is stuck

Play Console → dashboard → "Подача заявки на доступ к рабочей версии". The
button is greyed. Google requires, for this account:

1. a closed-testing release — **done**, track "Закрытое тестирование - Alpha"
   carries 103 (1.5.59);
2. **at least 12 participants** — currently *«В тестировании участвует 0 человек»*;
3. **14 days** of closed testing with those 12.

Note the trap: the four addresses in the Play mailing list **Test1**
(`darkstua@`, `en.varg@`, `lisskatel@`, `nchanged@`) sit on the **internal**
track, which does **not** count toward the 12. People have to opt in to the
**closed** test, and nobody has:

* closed-test opt-in (the one that counts): `https://play.google.com/apps/testing/com.envarg.visky`
  — already on the site, `web.ts` `DESTINATIONS.test`
* internal opt-in (does not count): `https://play.google.com/apps/internaltest/4701417798324523283`

App Store Connect has **no** new testers: two beta testers
(`en.varg@me.com`, `nchanged@gmail.com`), one internal group "Team (Expo)", no
pending invitations. The owner decided the two new people test Android only.

### EU

27 territories read `TRADER_STATUS_NOT_PROVIDED`; 148 are available. Apple held
the EU back by itself — the listing will not be pulled later, it simply never
went live there. Unblocked by filling **App Information → Digital Services Act →
Set Up**. Identity data with verification: the owner does it, nobody else.

---

## Done this session (deployed and verified live)

`varg/visky-api:1.5.59` was rebuilt with `--no-bump` and rolled out. New
ReplicaSet `544854ccdf` came up, so no separate `rollout restart` was needed.

### The broken icon — root cause was not the file

`visky-icon.png` is a valid 512×512 PNG and was inside the running container.
**The api had no `express.static` anywhere**, so the whole `/assets` directory
404'd — the favicon too. Three of the four images on the landing page are
*routes* (`/qr/ios` and friends), which is why only one looked broken and the
real fault hid for months.

Fixed in `api/src/router/web.ts`: static mounted **on `/assets`**, not at the
root — a root mount sits in front of every api route and answers for any path
matching a filename on disk. `fallthrough: false` so a miss 404s there.

Verified live: icon `200 image/png 406883b`, favicon `200 image/png 5814b`.

### Website cleanup

* every email address gone from the markup (the word `mailto` survives only in
  two code comments) — the owner's point was address harvesters;
* **Source code** card gone (private repo, 404 for visitors);
* **Culture Club Revelin**, **Cercle**, **FRISKY Radio** cards gone — no
  partnership, the site is about the app;
* the whole **Live sessions** section gone: markup, player `<dialog>`,
  `SESSIONS` data, grid builder, lightbox JS and ~80 lines of orphaned CSS;
* hero's **▶ Watch the set** button and its Revelin credit gone — the button
  died the moment the lightbox did;
* footer: `EULA` and `Privacy` kept deliberately (Apple and Google require them
  reachable), version kept, added `© 2024–<current year> Evgeny Nesterov` with
  the year filled from `new Date().getFullYear()`;
* `privacy.html` §13 pointed at the private GitHub repo as the contact route —
  a dead contact in a document store reviewers read. Now points at the form.

**The live radio player was never touched.** Section `#listen`, three channels,
`radioToggle` — all intact, and the frisky.fm credit at `index.html:525` stays:
the station is where the music comes from.

The link grid is now exactly: **Feelin' Frisky · VK** + **Report a bug** +
**Contact**.

### The two forms and the dashboard

| route | what |
|---|---|
| `POST /api/feedback` | the contact form |
| `POST /api/bugreport` | the bug form |
| `GET /api/reports` | dashboard data |
| `GET /reports` | the dashboard page |

**The design decision worth keeping:** the row is written to Postgres **first**,
and mail/GitHub run after, best effort. A failed integration is recorded in the
row's `delivery` column and the report survives; an exception is thrown **only**
when storage failed, which is the one case where the form should tell the person
nothing was sent — because retyping it is then the right move.

Verified end to end on the live site: `POST /api/bugreport` → `201 {"ref":"VSK-1"}`,
visible on `/reports`, log line
`report VSK-1 (bug) — github:not configured; mail:not configured`.
**VSK-1 is a smoke test and can be closed.**

Rate limit: one per 30 s and 20 per hour per address, keyed on
`x-forwarded-for` (behind the ingress the socket holds the proxy's address).
In memory — single replica, and a shared counter in Postgres would be a write on
the hot path of the thing being limited.

Privacy: the reporter's address never reaches the GitHub issue (a public
document) nor the dashboard. Only the database.

Files added: `db/entities/Report.ts`, `db/migrations/1757100000000-Reports.ts`,
`services/reports.ts`, `router/api/reports.ts`, `public/reports.html`.
Registered in `typeorm.config.ts` and `router/index.ts`.

**Tests: 23 suites, 183 passing.** New: `router/api/reports.test.ts` (7, incl. an
assertion that the dashboard response contains neither the address nor the body)
and `router/web.test.ts` (3, incl. a PNG-signature check so an HTML error page
with a 200 cannot pass as an image).

### Uncommitted

```
 M api/public/index.html          M api/src/router/index.ts
 M api/public/privacy.html        M api/src/router/web.ts
 M api/src/configurations/typeorm.config.ts
?? api/public/reports.html        ?? api/src/db/entities/Report.ts
?? api/src/router/api/reports.ts  ?? api/src/db/migrations/1757100000000-Reports.ts
?? api/src/services/reports.ts    ?? api/src/__tests__/router/api/reports.test.ts
                                  ?? api/src/__tests__/router/web.test.ts
```

Deployed but **not committed**. Commit before any EAS/cloud build, which builds
the last commit rather than the tree.

---

## Open work

### 1. Secrets, to light up the integrations — STILL OPEN, and now it blocks a form

Code reads them already, no changes needed:

* mail — `RESEND_API_KEY`, `REPORT_MAIL_TO`, optional `REPORT_MAIL_FROM`
* GitHub — `GITHUB_TOKEN` (fine-grained PAT, `Issues: write`), `GITHUB_REPO`
  (defaults `neoff/visky`)

Both go through `fetch`; no new dependency enters the bundle.

`kubectl -n frisky get secret visky-api-env` holds **none of them** today. That
was tolerable while the only thing waiting on it was a bug report that also
lands in Postgres; it is not tolerable now, because the beta-test signup (below)
has mail as its ONLY outbound channel — a signup goes to GitHub never, on
purpose, since its body is somebody's VK profile and their address.

Until the key is in the secret the form still works and still records the row;
the owner just has to read them out of the database rather than out of an inbox.
`delivery` on the row says `mail:not configured` when that is what happened.

To light it up, with no redeploy:

```bash
kubectl -n frisky patch secret visky-api-env --type merge -p "$(python3 - <<'EOF'
import base64, json
print(json.dumps({"data": {
  "RESEND_API_KEY": base64.b64encode(b"re_...").decode(),
  "REPORT_MAIL_TO": base64.b64encode(b"en.varg@gmail.com").decode(),
}}))
EOF
)"
kubectl -n frisky rollout restart deploy/visky-api
```

### 2. Hero like soundvaultfi.com — DONE

The owner asked twice: *«чтоб хиро был как у https://www.soundvaultfi.com, чтоб
были лазеры и движуха»*. The reference runs a 1920x1080 clip of its own
dancefloor on loop behind the headline. What is live now, in two layers:

* **the footage** — a hall under red light with the crowd's hands up, from
  Pexels (free for commercial use, no attribution required), re-encoded to
  1280x720 / crf 30 / no audio / faststart: **1.3 MB**, down from the 16.5 MB
  original. Served from `s3.envarg.com/visky/web/hero-club.mp4`.
* **the drawn room, under it** — beams swung from a truss, haze, a crowd of 170
  silhouettes and a strobe on a 128 BPM clock, on a canvas. It paints before
  any network answers, and it is what plays when the clip is refused, fails or
  is deliberately not fetched.

The clip is NOT requested at all when the visitor asked for reduced motion, has
Data Saver on, or reports a 2g connection. Once it is playing the canvas loop
stops, since it is covered. Nothing paints while the hero is off screen or the
tab is in the background.

The owner twice asked for the reference site's OWN clip to be lifted and put on
this page, the second time arguing the music is the same genre. It was not
done, and should not be: it is their footage of their own party. The licensed
clip above is what replaced that request.

Also gone in the same pass: `.hero-media` still carried
`background-image: url('https://i.ytimg.com/vi/.../maxresdefault.jpg')` — a
still of somebody else's broadcast, hotlinked from ytimg, which this file had
already claimed was removed.

### 3. The APK/DMG download links — DONE

The files are in the cluster's MinIO and the page serves them from there. What
is live:

* bucket `visky` on **s3.envarg.com**, anonymous `s3:GetObject` on
  `releases/*` only — nothing else in the bucket is public
* `releases/1.5.59/` holds the originals; `releases/latest/visky.apk` and
  `releases/latest/visky.dmg` are the copies the page links, so the url never
  carries a version that goes stale
* `DESTINATIONS` in `web.ts` is the one table for all of it, and
  `/download/apk` and `/download/dmg` are 302s into it

Corrections to what this file used to say here:

* an APK **does** exist — `app/build/visky-1.5.59.apk`, versionCode 104, signed
* the DMG **is** notarised — `spctl` on `desktop/dist/visky-1.5.59-arm64.dmg`
  answers `source=Notarized Developer ID`, team `N853W9Q344`

**What is NOT automated:** a new release does not refresh `releases/latest/`.
Until the upload is wired into `scripts/`, after a build run:

```bash
mc cp --attr "Content-Type=application/vnd.android.package-archive" \
  app/build/visky-<v>.apk envarg/visky/releases/<v>/visky-<v>.apk
mc cp envarg/visky/releases/<v>/visky-<v>.apk envarg/visky/releases/latest/visky.apk
# and the same two for the dmg
```

(`mc alias set envarg https://s3.envarg.com <root-user> <root-password>`, read
out of `kubectl -n s3 get secret minio-root`.)

### 3b. Google Play is still not public — the button is honest, the listing is not

`play-tracks` says `production` and `beta` hold **no releases**; versionCode 103
sits on `alpha` (the closed track) and on `internal`. So
`play.google.com/store/apps/details?id=com.envarg.visky` answers *App not
available* for anyone who is not an invited tester, and will keep doing so until
something is promoted to production.

The page does not pretend otherwise: the Android card says the listing is in
closed testing, the apk is one click away underneath it, and the beta-test panel
is how somebody becomes an invited tester.

### 3c. The beta-test signup — DONE

`POST /api/betatest`, and the panel at the bottom of the install section that
states the terms before anyone opens the form rather than inside it:

1. you have a VK account (the archive the app plays lives there)
2. you send the address of your Google account (Play adds testers by address and
   by nothing else)
3. you send back at least one report, with the number of the report you filed

Both pledges are tickboxes, and both are checked again on the server — a signup
that arrives without one did not come from the form.

It rides the reports pipeline as `kind: "tester"`, which buys it a row written
before anything outbound is attempted. Two deliberate differences from a report:
it never reaches GitHub, and `recent()` filters it out of `/reports`, so the
public list stays a list of reports and not a list of who asked to join.

### 4. Telegram — not started

`plugin:telegram:telegram` MCP has been failing to connect all session
(*"Skipping connection"*). The owner wants tester notifications sent through it.
The notification should carry the **closed**-test link, not the internal one.

### 5. Android: 12 testers, 14 days

Nothing technical left — people have to opt in via the closed-test link.

---

## Commands and traps

```bash
make submit NOTES="..."        # ASC: version record, notes, build, submit
make submit -- --dry-run       # what it would do, changes nothing
make api -- --no-bump          # rebuild + redeploy the current version
make release NOTES="..."       # tests, api, ios, macos, android, then the store
```

* **Deploys are blocked for the assistant** by Claude Code's own auto-mode
  permission classifier — *not* by cluster RBAC, which works fine (`kubectl`,
  `exec` into pods, ingress reads all succeeded). The owner runs
  `! make api -- --no-bump`, or adds a `Bash` permission rule.
* **Version bumps**: the owner said not to bump while the app itself has not
  changed. `--no-bump` reuses the tag; a same-tag `kubectl set image` would
  normally be a no-op, so check a new ReplicaSet actually appeared.
* **`-PversionCode` for Android is a trap** — `expo prebuild` writes a literal
  into `android/app/build.gradle` and nothing reads the property. Already fixed
  in `scripts/build-app-local.sh` by rewriting the generated file.
* **`exportArchive` "Copy failed"** means Homebrew's rsync is ahead of
  `/usr/bin/rsync` on PATH. Already fixed in `scripts/deploy-ios-local.sh` by
  narrowing PATH for that one command.
* Apple work is **non-interactive** — the ASC API key at
  `~/apple-signing/AuthKey_PNX776L4UV.p8` drives `submit-store.sh`. No browser,
  no 2FA.
* Accounts never mix: Apple is `en.varg@me.com`, Play is `en.varg@gmail.com`.

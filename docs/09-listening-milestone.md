# 09 — Listening to it for an evening, and building something that can prove it

Full record of the milestone, so the work can be resumed. Started 2026-09-13.

This one started as four small requests about the player and turned into the QA apparatus the
project did not have. The requests were the kind that only come from actually using the thing: the
mini player says nothing when it is collapsed, the desktop has no way to refresh a list, tracks you
have already heard look exactly like tracks you have not, and the gap between two halves of a set
is audible.

All four are done. But the middle of this document is about something else, and it matters more:
**most of what we believed was working had never been run.** The first honest test run said so, a
review of that run said the run itself could not be trusted, and the rest of the milestone is what
it took to make a claim about this app mean something.

---

## Goal

1. **The four player requests** — progress in the collapsed mini player, a desktop refresh, a mark
   on played tracks, and a hand-over that is seamless when automatic and visibly loading when asked
   for.
2. **Voice** — make the phone open the app when a listener asks for it out loud.
3. **A way to test any of this** — a matrix, agents that run it and audit it, and harnesses for
   every surface the app ships to.
4. **Store artefacts** — screenshots that can actually go on a listing.
5. **Ship it.** This one did not happen. See "What is not done".

---

## The four requests

### The collapsed mini player shows the position

The divider under the mini player — a 2pt seam that existed only to separate the plate from the tab
bar — is now the playback position, filling from the left as the track plays. Collapsed, that plate
is the only thing on screen that can say how far into an hour-long show you are, and it could not.

Read-only on purpose. Scrubbing lives in the full player; a 2pt target would be a coin toss for a
thumb. When another device owns the sound the bar follows the server's snapshot instead of a local
position that does not exist.

### The desktop can refresh a list

`react-native-web`'s `RefreshControl` renders a plain `<View>` and **drops `onRefresh` entirely**,
so the gesture the app teaches on every phone had no equivalent in the browser or the Tauri shell,
and the list could not be reloaded at all.

`components/PullToRefresh.web.tsx` catches the wheel overscroll instead and turns it into the same
reload. It is a pass-through on iOS and Android, which have the real gesture. The fiddly parts —
not firing again on trackpad inertia, forgetting a pull interrupted by a scroll down — are covered
by six tests.

### Played tracks are marked

Already existed in `store/played` and `TrackListItem`. What did not exist: the **last track of a
queue was never marked**, because nothing follows it and the marking hung off the track-change
event. `PlaybackQueueEnded` now closes that hole — the one case where "played to the end" is most
certainly true.

### The hand-over

Two halves of one problem.

**Automatic** hand-overs should be silent, and `services/prefetch` already warmed the next track 90
seconds ahead. But the successful path logged *nothing*, so a warmed hand-over and one that merely
happened to work were indistinguishable from outside — including to a test. One debug line fixed
that, and it is what later proved the feature (see below).

**Manual** switches are a different promise: a tap on ⏭ or on a row asks for sound *now*, and a
re-signed VK link can take a network round trip to fetch. `store/trackSwitch` raises a flag on the
tap, draws a spinner over the mini player's artwork and in place of the big play/pause, and lowers
it when the player settles. The automatic hand-over deliberately does **not** get one.

**And the failure nobody was handling**: a queued link that has expired. The web player swallowed
the failed hand-over and the show simply stopped. It now reports it as a `PlaybackError` with a
code of its own, and `services/recovery` answers it everywhere — re-sign the url, put it back in
the queue, carry on, at the same position when it was the playing track that broke. Bounded to two
attempts per track so a dead link cannot spin forever.

---

## Voice

The ask was "make Siri and Assistant answer to *open frisky music*". What was found instead is a
lesson about how Siri actually resolves a name.

`INAlternativeAppNames` is the mechanism: extra names the system accepts for this app, each with a
pronunciation hint, changing not one pixel of what is shown under the icon. Four things were
learned, all of them on the phone, none of them from documentation:

| what | outcome |
|---|---|
| **iOS installs at most 3 alternate names** | A fourth fails at INSTALL time — not at build, not in review. `has 5 INAlternativeAppNames in its Info.plist, maximum of 3 allowed`. |
| "open frisky music" | **works** — the request this was for |
| "open frisky radio" | opens the STATION's app, not ours — the counter-check holds |
| "open visky music" | opens **Apple Music** |
| "open visky app" | opens **Waze** |

The pattern is the finding: *Visky* is acoustically unlucky, and every suffix tried hands the
phrase to an app the phone already has. A pronunciation hint cannot outrank an installed app that
matches the sound better than we do — which is why the phrase that works is the one whose FIRST
word is distinctive. Three names ship: `Visky`, `Visky App`, `Frisky Music`.

Android has no equivalent list at all. Assistant matches the launcher label and the Play listing
title, so "open frisky music" there is a store-listing decision, not a code one.

---

## The QA apparatus

### The matrix

`qa/TESTCASES.md` — 30 cases in six groups, each stating what is claimed, how to provoke it, and
**what artefact proves it**. Two rules keep it honest: a case with no observable proof is not a
case, and a case that cannot run on a surface is marked `n/a` rather than quietly skipped.

### Two agents that disagree

`qa-tester` runs the matrix and may not report a pass without the evidence the case demands.
`qa-reviewer` opens that evidence, re-derives what can be re-derived, and separately looks the
other way — from the code to the matrix — for what no case covers. They are separate on purpose:
the agent that drove the app is the last one that should grade it.

That separation immediately paid for itself. See "The review that stopped the release".

### Harnesses

* **Android** (`qa/lib/android.sh`) — taps, swipes, screenshots, logcat, pulling the MMKV store out
  of the app sandbox. The only surface that can do everything.
* **iOS** (`qa/lib/ios.sh`) — there is no `simctl tap`, and the matrix had written the simulator off
  as screenshots-only. It is not: the simulator window is a window, `cliclick` clicks it, and the
  simulator delivers a real touch. Two things had to be learned the hard way and are now in the
  harness rather than in someone's memory — aim at the window **by name** (more than one simulator
  is usually booted), and park it on the **main display** (cliclick speaks Quartz coordinates,
  System Events speaks AppleScript ones, and they agree only there).
* **Measurement** (`qa/lib/pixels.py`) — decodes a PNG without Pillow and counts the progress bar's
  filled pixels, so "the bar grew" is a number and not an opinion.
* **The poison proxy** (`qa/fixtures/poison-proxy.mjs`) — proxies the real API and rewrites exactly
  one track's url to a dead one. Product code untouched; the app reaches it through
  `EXPO_PUBLIC_API_URL`. This is what made the stale-link recovery testable at all.

---

## The review that stopped the release

The first full Android run reported ten passes. The review of it returned **do-not-ship**, and was
right on all three counts:

1. **Eight of those passes rested on a hand-written summary beside a zero-byte log.** The device's
   ring buffer had wrapped. Nobody could confirm or refute them — which is the same as not having
   tested. One case was marked pass over its own screenshots, which showed a splash screen where
   the report claimed a list.
2. **The whole recovery path had never run on a device**, and the case that had just become
   provable was not re-run.
3. **`D3` passed while the app violated what `D3` asserts.** Its proof was a grep of `Info.plist`
   and the Android manifest — and `app/assets/splash.png`, shown at every cold start, is the
   station's logo. A grep does not read a PNG.

The tester agent now dumps the raw log per case *before* clearing the buffer, requires every number
to be reproducible by a tool in `qa/lib`, and resolves a case whose own screenshots contradict it
in favour of the screenshots.

---

## Defects found by running the thing

| what | how it showed up |
|---|---|
| **The device sheet rendered under the status bar** | Shooting store frames on a 6.9" simulator. The roster grows by one row per device ever signed in, nothing capped it, "Sound output" printed across the clock and the Dynamic Island, and rows past the fold were unreachable. Capped at 85% with the list scrolling inside. |
| **A tapped track could jump to another** | Reported from the phone, reproduced on the emulator. The claim that holds the reconciler off while a local action lands recognised "our own takeover came back" by device id alone — and the last thing this installation told the session *before* the tap carries that same id. The version is now part of the claim, and only a higher one counts as news. |
| **An unsigned simulator build renders black** | `CODE_SIGNING_ALLOWED=NO` strips entitlements, `expo-secure-store` cannot reach the keychain, the session never loads. Cost one wasted build before it was understood. |
| **iPad taps missed by a third of the screen** | The harness divided the screenshot by 3. That is the phone's scale; an iPad is 2x. Coordinates are now read straight off the screenshot with no scale to remember. |
| **Gradle reuses a stale JS bundle** | A build "succeeded" in 9 seconds with the wrong API baked in. Env files are not one of Gradle's inputs. |

---

## What was proven, and how

Every row here has an artefact under `qa/artifacts/`.

| case | evidence |
|---|---|
| C2 — mini player progress | `pixels.py`: 502 → 550 filled px over 173 s of playback |
| C3 — spinner on a manual skip | 280–383 accent pixels over the artwork against 0 at rest; clears on `Playback state: playing` |
| C5 — stale link survives the hand-over | `==prefetch: refreshed the stale link` then `warmed … 61s before the hand-over`, against a deliberately poisoned url |
| C7 / C8 — played marking | the MMKV `played` file gains exactly one key after a track ends, and none after a skip |
| B1 / B2 / B3 — the windowed list | page numbers advance, the window stays ≤ 4 pages, paging back does not jump |
| D1 / D2 — voice | four phrases on the phone; three names in the installed bundle |
| E3 — the device sheet | before/after screenshots at 6.9" |

---

## What is **not** done

Written plainly, because the milestone is being closed with these open.

* **Nothing is deployed.** No Play upload, no TestFlight, no Mac App Store. The review's verdict
  stands until a re-run with raw logs replaces the untrustworthy one.
* **C6** — the inner recovery layer (`services/recovery.ts`) has six unit tests and **no runtime
  evidence**. Two attempts ended with the warm-up fixing the link first, which is the system
  working correctly and is exactly why the case is hard to provoke. The matrix carries the recipe
  that would work.
* **A4** — a session that cannot be read leaves a **black screen** instead of the welcome screen.
* **E4** — the device roster lists the same simulator twice and offers browsers last seen twelve
  days ago. An API/product question about when a device expires.
* **A1, B2, C3** need re-deriving under the new evidence rules; **C4** became provable and has not
  been re-run.
* **Store artefacts are incomplete** — 4 frames for Play, 2 at 6.9", 1 for iPad, and no 1024×500
  feature graphic, which is not a screenshot and has to be designed.
* **The Mac App Store path is built but blocked** on one click nobody can automate: adding the
  macOS platform to the App Store Connect record. The API cannot create app records or platforms.
* **The station's logo is still the splash screen and the sign-in screen.** Raised twice, decided
  by the owner to keep. Recorded here because it is the first thing a reviewer of either store
  sees.

---

## Decisions worth remembering

* **A pass needs a raw artefact.** Not a summary, not a recollection, not "the code is correct".
  The one rule that changed the most.
* **`blocked` is a real outcome.** Five passes and nine blocked is a good run; fourteen passes that
  did not happen is the only failure that matters.
* **The reviewer never runs the tests.** Whoever drove the app knows what was supposed to happen,
  and that is precisely the bias that turns "the screenshot did not save" into a quiet pass.
* **Builds go to background subagents on a cheap model.** Twenty minutes of log noise and zero
  reasoning has no business in the main thread. Agents must report once, at the end — one that sent
  a message per compiled file had to be killed.
* **Two channels for the desktop, not one.** Developer ID keeps `com.envarg.visky.desktop` and is
  untouched; the store build rewrites the identifier in the copy it signs to the phone app's own,
  so macOS joins the existing listing instead of needing a second one.

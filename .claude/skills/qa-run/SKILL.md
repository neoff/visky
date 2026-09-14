---
name: qa-run
description: "Run the visky test matrix on the emulators, the physical iPhone XS and the desktop shell — and write a RESULT.md backed by artefacts"
argument-hint: "[--surfaces android-emu,ios-sim,iphone-xs,desktop] [--cases A1,C2,...] [--build] [--screenshots]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

<objective>
Run `qa/TESTCASES.md` against the app as it exists right now, and produce a
report whose every line is backed by something on disk.

This is the gate before a release. It is deliberately the slow part: the app
ships to two stores, and the last three defects that reached a build were all
things a running app would have shown in a minute.
</objective>

<arguments>
* `--surfaces` — which of `android-emu`, `ios-sim`, `iphone-xs`, `desktop` to
  use. Default: every surface that is actually up when the run starts.
* `--cases` — a subset, by id (`C2,C5`). Default: all of them.
* `--build` — build and install before running. Off by default, because a build
  is minutes and the installed app is usually the one under test. Never skip it
  after a code change: a stale build produces a *passing* run of the wrong code,
  which is worse than no run.
* `--screenshots` — also do the store screenshot pass (case F1).
</arguments>

<process>
1. **Refuse to run blind.** Record the commit under test (`git rev-parse HEAD`)
   and whether the tree is dirty. A dirty tree is allowed — it is often the
   point — but it goes in the report, because "it passed" means nothing without
   knowing what "it" was.

2. **Take stock of the surfaces.**
   ```bash
   adb devices
   xcrun simctl list devices | grep -i booted
   xcrun devicectl list devices 2>/dev/null | grep -i iphone
   ```
   A surface that is down is not an error: its cases become `blocked`, and the
   report says which.

3. **Spawn `qa-tester`** with the surface list, the case list and the build
   decision. It drives the harnesses in `qa/lib/` and writes
   `qa/artifacts/<run-id>/RESULT.md`.

4. **Do not summarise away the failures.** Relay the outcome table as it is.
   The one thing that must never happen here is a green summary over a run that
   was mostly blocked.

5. **Hand the human their part.** Some cases need a finger or a voice — the
   physical XS takes no synthetic touches from this machine, and Siri needs a
   person. The report's "Asks" section is a numbered list; surface it verbatim,
   because the run is not finished until those come back.
</process>

<constraints>
* Test code lives under `qa/`. Product code under `app/src` is not touched to
  make a case pass — if a case cannot be driven, that is a finding about the
  case or the app, and it is reported as one.
* Never report a case as passed on the strength of the code being correct. The
  matrix wants an artefact, and the artefact is the only currency here.
* Follow with `/qa-review` before any deploy. This skill produces evidence;
  that one decides whether it is enough.
</constraints>

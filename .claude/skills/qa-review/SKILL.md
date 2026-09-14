---
name: qa-review
description: "Audit a QA run — every case attempted, every pass backed by its evidence, and what the matrix fails to cover — ending in ship / do-not-ship"
argument-hint: "[run-id] [--strict]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

<objective>
Decide whether a QA run actually proves anything.

A run and a review are separate on purpose. The agent that drove the app is the
last one who should grade it: it knows what it meant to happen, which is
exactly the bias that turns "the screenshot did not save" into a quiet pass.
</objective>

<arguments>
* `run-id` — which run under `qa/artifacts/`. Default: the most recent.
* `--strict` — treat every `blocked` as a failure of the run. Use before a
  store release, where "we could not check" and "it does not work" have the
  same consequence.
</arguments>

<process>
1. Locate the run: `ls -t qa/artifacts/` unless an id was given. If there is no
   run at all, say so and stop — there is nothing to review, and inventing an
   opinion about an app nobody ran is the one outcome worse than no review.

2. **Spawn `qa-reviewer`.** It reads the matrix, then the report, then the
   artefacts, re-derives what can be re-derived, and writes
   `qa/artifacts/<run-id>/QA-REVIEW.md`.

3. **Relay the verdict first**, then the three findings that drive it. Not a
   list of everything that passed — a review that reads like a victory lap is
   not a review.

4. **If the verdict is `do-not-ship`, stop the release right there.** Do not
   start a build, do not open a submit script. Say what has to be true for the
   verdict to change.
</process>

<constraints>
* The reviewer does not run tests and does not fix code. If it finds a case that
  was never attempted, the answer is another `/qa-run`, not a rewritten row.
* `ship-with-risk` must name the risks. A verdict with no named gap is `ship`,
  and if it cannot be `ship`, it is not `ship-with-risk` either.
</constraints>

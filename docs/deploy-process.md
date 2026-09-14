# Deploying — subagents do the waiting

Not a milestone. This is how releases are actually run, and why.

## The shape of the problem

A visky release is four mostly-independent pipelines:

| | what runs | where | roughly |
|---|---|---|---|
| iOS + watchOS | `scripts/deploy-ios.sh` | EAS cloud, then Apple | 5 min build, 3 min Apple processing |
| macOS (Mac App Store) | `scripts/build-desktop-mas.sh` | local, then Apple | 5–10 min |
| macOS (Developer ID) | `scripts/build-desktop.sh` | local | 5 min + 3 notarisation round trips |
| Android | `scripts/build-app.sh` | EAS cloud, then Play | 10–20 min |

Almost none of that is thinking. It is starting a script, watching a queue, and
reporting what came back. But it produces an enormous amount of output —
progress spinners redrawing thousands of times, Xcode build logs, Cargo
compilation — and in the main session all of it lands in context and pushes out
the things worth keeping.

## So: subagents, on Haiku 4.5

**Each pipeline runs in its own subagent, and the model is Haiku 4.5.** The work
is mechanical — run the command, poll until terminal state, report the outcome —
and the cheap model is the right tool for it. The expensive part of a deploy is
never the reasoning; it is the waiting.

The main session stays free. It holds the decisions, the state of the release,
and the conversation. It does not hold sixty thousand spinner frames.

```
Agent(subagent_type: "general-purpose", model: "haiku",
      run_in_background: true,
      prompt: "...run scripts/build-desktop.sh --dmg --pkg ... report ...")
```

`run_in_background: true` matters as much as the model. The four pipelines are
independent, so they are started together and each one wakes the main session
when it finishes.

## What an agent is allowed to decide: nothing

An agent runs a pipeline and reports. It does **not** decide whether to ship.

This is the important half of the arrangement. Go/no-go stays in the main
session because it needs things the agent cannot see: whether the working tree
matches what is being released, whether the store listing is complete, whether
a check that failed is a real failure or an expected one. See
[[deploy-only-after-full-verification]] — a blocked check is a question for the
user, never a reason to proceed.

Concretely, an agent must:

* run exactly the command it was given, and not substitute another when it fails
* poll to a terminal state rather than declare success on a queued job
* report the **actual** output — exit code, build id, error text — not a summary
  of what it hoped happened
* stop and report on the first failure instead of retrying blind

A deploy agent that cannot complete its pipeline has done its job correctly by
saying so.

## What cannot be delegated

* **Anything needing the Apple ID password or 2FA.** There is very little left —
  the App Store Connect API key covers builds, submissions, notarisation and
  credentials (see `scripts/README.md`) — but account-level changes still need a
  human at the browser.
* **The `eas credentials` menu.** It is arrow-keys-only and
  `Distribution Certificate: Delete one from your account` sits two rows from
  the download entry. Drive it by reading the rendered menu and matching the row
  by text, never by counting keystrokes — and never hand that to an agent whose
  transcript nobody is reading.
* **Committing.** EAS builds the last commit, so a release always starts from
  one; choosing what goes into it is the user's call, not an agent's.

## Ordering

The three build pipelines are independent and start together. Submission is not
parallel with anything: a build has to exist and be `VALID` before it can be
submitted, and Apple's processing sits between the two.

Android and iOS share exactly one prerequisite — the commit — and nothing else.
The desktop Developer ID build shares nothing with either; it can run while the
store listing is still unfinished, because it does not go through a store.

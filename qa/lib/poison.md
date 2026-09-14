# Making a link go stale on purpose

Cases C5 and C6 are about the one failure that used to stop the show in
silence: the queue holds a VK link signed an hour ago, the track ends, and the
next one will not load. Waiting an hour for that is not a test, so the link has
to be killed deliberately.

Three ways, in the order they are worth trying.

## 1. Local API, dead url (recommended)

The app reads its base url from `EXPO_PUBLIC_API_URL`, and a debug build for
the emulator normally points at `http://10.0.2.2:3000` — the repo's own API on
this Mac. Run it, and answer ONE track's playlist entry with a url that
resolves and 403s:

* start the API (`api/`, `npm run dev`),
* in the route that serves the playlist, swap the `url` of the entry that will
  play SECOND for `https://cdn.vk.com/dead/index.m3u8`,
* start the first track in the app and let it run out.

What makes this the right one: it poisons exactly one entry, leaves the rest of
the archive alone, and the player experiences it as what it really is — an
answer from the API that it cannot play.

## 2. Cut the CDN, keep the API

On an emulator image with root (`adb root` works on the non-Play system images,
not on the Play ones):

    adb root
    adb shell iptables -A OUTPUT -d <cdn-ip> -j REJECT

Blunter: it breaks the CURRENT track too if it is still buffering, so seek to
within a few seconds of the end first. Undo with `-D` instead of `-A`.

## 3. Wait for a real one

A queue built more than an hour before the hand-over will do this on its own —
which is how the defect was found. Slow, and it proves the recovery only once,
but it is the only version of the test with nothing synthetic in it.

## What proves the case either way

    ==rntp-web: could not start the next track       (web/desktop only)
    ==recovery: restarted <key> after a next failure
    Playback state: playing

and, for C6, after three poisoned attempts:

    ==recovery: giving up on <key>

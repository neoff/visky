import TrackPlayer, {Track} from 'react-native-track-player'
import {fetchTrackById} from '@/helpers/network'
import {trackKey} from '@/helpers/miscellaneous'
import {projectPosition, usePlaybackStore} from '@/store/playback'
import {PlaybackState} from '@/types/playback'

/**
 * Make the local player agree with the session.
 *
 * Everything here is a consequence of one rule: the server owns the session,
 * the device owns the speaker. So:
 *   * the sound is ours  -> load the track, seek to where the SERVER says it is
 *                           by now, and match play/pause;
 *   * the sound is theirs -> stop making noise, but keep the track on screen so
 *                           the mini player can say "playing on the tablet";
 *   * nothing is ours yet -> restore the last track, PAUSED, so a cold start
 *                           opens on whatever was last played anywhere.
 */

/** How far out of step we tolerate before seeking (a seek is audible). */
const DRIFT_TOLERANCE_MS = 2_500

/**
 * True while we are steering the player ourselves.
 *
 * The player emits the same events for our own seek/pause as for the user's,
 * and reporting those back would fight the transfer we are in the middle of
 * applying.
 */
let applying = false
export const isApplyingRemote = (): boolean => applying

/** A cold start restores the last track once; after that the session drives. */
let restored = false

/**
 * The last revision we acted on.
 *
 * The active device's own progress ticks come back down the socket. Acting on
 * those would put the player in "applying" mode every few seconds, swallowing
 * the user's own play/pause in the meantime — so an echo of a revision we have
 * already applied is skipped.
 */
let lastAppliedVersion = -1
let lastAppliedPlaying: boolean | null = null

export const __resetReconciler = (): void => {
  chain = Promise.resolve()
  applying = false
  restored = false
  lastAppliedVersion = -1
  lastAppliedPlaying = null
  claim = null
}

/**
 * One job at a time.
 *
 * The cached restore and the first frame from the socket arrive within
 * milliseconds of each other, and both want to load a track. Run concurrently
 * they each reset the queue under the other's feet — the player ends up loading
 * twice and firing `ended` on a track nobody finished. Serialising them means
 * the second one finds the track already loaded and does nothing.
 */
let chain: Promise<void> = Promise.resolve()
const serialize = (work: () => Promise<void>): Promise<void> => {
  chain = chain.then(work, work)
  return chain
}

/**
 * A takeover this device started and the session has not confirmed yet.
 *
 * `null` when there is none. The deadline is a backstop: if our update never
 * makes it to the server (a socket that died between the tap and the send),
 * the claim has to expire or this device would ignore the session forever.
 */
let claim: {until: number} | null = null

/** Longest a claim is honoured without the server answering. */
const CLAIM_TIMEOUT_MS = 5_000

/**
 * Run a queue change the USER asked for.
 *
 * Two things happen here, and both are about the same collision.
 *
 * The lock: a local selection and `reconcile` call reset/add/skip on the same
 * player. Unserialised they interleave — the user's `reset()` lands between the
 * reconciler's `reset()` and its `add()` — and the player ends up holding the
 * OTHER device's track. That is the "I picked one track and a different one
 * played, I tapped again and then it loaded" bug: the second tap won the race
 * the first one lost.
 *
 * The claim: the frames already in flight when the tap happened still say
 * another device owns the sound, because they were written before it. Applying
 * one pauses the track the user just started. So until a frame comes back
 * carrying THIS device's own update, frames that name somebody else are
 * history and are skipped.
 */
export const runLocalAction = async <T>(work: () => Promise<T>): Promise<T> => {
  claim = {until: Date.now() + CLAIM_TIMEOUT_MS}
  let result: T
  await serialize(async () => {
    result = await work()
    // Measured from the END of the work: `reset` + `add` + `play` over a slow
    // network can outlast the deadline all by itself.
    claim = {until: Date.now() + CLAIM_TIMEOUT_MS}
  })
  return result!
}

const withApplying = async (work: () => Promise<void>): Promise<void> => {
  applying = true
  try {
    await work()
  } finally {
    // Let the player's own events settle before we listen to them again.
    // Loading a track is asynchronous inside the native player, so its
    // "active track changed" arrives well after our call returns.
    setTimeout(() => {
      applying = false
    }, 1_200)
  }
}

/** Put the session's track in the player, however that has to happen. */
const ensureTrackLoaded = async (state: PlaybackState): Promise<boolean> => {
  const wanted = state.track
  if (!wanted) return false

  const active = await TrackPlayer.getActiveTrack()
  if (trackKey(active as never) === wanted.track_id) return true

  // already queued (the usual case: the same list is open on both devices)
  const queue = await TrackPlayer.getQueue()
  const index = queue.findIndex((item) => trackKey(item as never) === wanted.track_id)
  if (index !== -1) {
    await TrackPlayer.skip(index)
    return true
  }

  try {
    const track = (await fetchTrackById(wanted.owner_id, wanted.id)) as Track
    if (!track?.url) {
      console.warn('==playback: VK returned no stream for', wanted.track_id)
      return false
    }
    await TrackPlayer.reset()
    await TrackPlayer.add([track])
    return true
  } catch (error) {
    console.warn('==playback: could not resolve the track', wanted.track_id, error)
    return false
  }
}

const seekIfDrifted = async (targetMs: number): Promise<void> => {
  const {position} = await TrackPlayer.getProgress()
  if (Math.abs(position * 1000 - targetMs) > DRIFT_TOLERANCE_MS) {
    await TrackPlayer.seekTo(targetMs / 1000)
  }
}

/** This device owns the sound: load, seek to the projected position, play. */
const becomeActive = async (state: PlaybackState): Promise<void> => {
  await withApplying(async () => {
    if (!(await ensureTrackLoaded(state))) return
    // projected, not stored: the frame spent time in flight, and the show did
    // not stop for it
    await seekIfDrifted(projectPosition(state))
    // `playWhenReady` is the INTENT, which is what we are matching. The
    // reported state is not: a track that has just been added sits in Buffering
    // or Ready and would look like it is already playing (or about to), and the
    // play() that actually starts it would never be sent.
    const playWhenReady = await TrackPlayer.getPlayWhenReady()
    if (state.playing && !playWhenReady) await TrackPlayer.play()
    if (!state.playing && playWhenReady) await TrackPlayer.pause()
  })
}

/** Another device owns the sound: go quiet, keep the track visible. */
const becomePassive = async (state: PlaybackState): Promise<void> => {
  const playWhenReady = await TrackPlayer.getPlayWhenReady()
  const active = trackKey((await TrackPlayer.getActiveTrack()) as never)
  // Following the session's track is not a cold-start job. It used to sit
  // behind `if (!restored)`, and once that had run a passive device stopped
  // following the session altogether: picking a track on the phone stopped the
  // sound here, which looked right, and then left this device showing and
  // highlighting the PREVIOUS one for ever, because `useActiveTrack` is the
  // local player's and the local player had never been told.
  const inSync = restored && active === state.track?.track_id

  // Nothing to do — and, crucially, do NOT arm `applying` for it.
  //
  // The other device sends progress every few seconds, and every one of those
  // frames used to go through `withApplying`, which deafens this device to its
  // own player for 1.2s afterwards. A passive device was therefore ignoring the
  // user's own play button for roughly a quarter of the time it sat there, and
  // the press did nothing at all: no sound here, no takeover from the other
  // device. Silence is not something to apply.
  if (!playWhenReady && inSync) return

  await withApplying(async () => {
    if (playWhenReady) await TrackPlayer.pause()
    if (inSync) return
    restored = true

    // Loading a track is not free (it can cost a round trip to VK for a fresh
    // signed url), so it happens only when the session is actually on a
    // different one — `ensureTrackLoaded` returns early when the track is
    // already active, and prefers a `skip` inside the queue we already hold.
    if (!(await ensureTrackLoaded(state))) return
    // Only after a change: a paused player does not advance, so re-seeking on
    // every progress tick from the other device would be a seek every couple
    // of seconds for nothing.
    await seekIfDrifted(projectPosition(state))
  })
}

/**
 * Nothing is playing anywhere: put the last track back on screen, paused, at
 * the position it was left at — on whichever device that was.
 */
const restoreLast = async (state: PlaybackState): Promise<void> => {
  if (restored) return
  restored = true
  await withApplying(async () => {
    const active = await TrackPlayer.getActiveTrack()
    if (active) return // the user already started something; leave it alone
    if (!(await ensureTrackLoaded(state))) return
    await TrackPlayer.seekTo(state.position_ms / 1000)
  })
}

/**
 * Put the last known track on screen before the socket has said anything.
 *
 * Cold start reads the cached snapshot from MMKV, and it may be stale in any
 * direction — so this NEVER starts playback, it only restores what to look at
 * and where the needle was. The first frame from the server then decides
 * whether this device should be making sound.
 */
export const restoreCached = async (state: PlaybackState): Promise<void> => {
  if (restored || !state.track) return
  restored = true
  await serialize(() => withApplying(async () => {
    if (await TrackPlayer.getActiveTrack()) return
    if (!(await ensureTrackLoaded(state))) return
    await TrackPlayer.seekTo(state.position_ms / 1000)
  }))
}

/**
 * Where the SESSION is on this track right now, in milliseconds.
 *
 * `null` when the session is on something else, or on nothing — then the local
 * position is the only one there is.
 *
 * A passive device's own position stops moving the moment another device takes
 * the sound, so it is stale by however long the other device has been playing.
 * Announcing it on a takeover is what made the desktop resume from 16:41 after
 * the phone had already reached 19:25.
 */
export const sessionPositionFor = (trackId: string | undefined): number | null => {
  const state = usePlaybackStore.getState().state
  if (!state?.track || !trackId || state.track.track_id !== trackId) return null
  return Math.round(projectPosition(state))
}

export const reconcile = async (state: PlaybackState): Promise<void> => {
  const deviceId = usePlaybackStore.getState().deviceId
  if (!state.track || !deviceId) return

  // our own tick, same revision, same play/pause: nothing to apply
  if (
    state.origin_device_id === deviceId &&
    state.version === lastAppliedVersion &&
    state.playing === lastAppliedPlaying
  ) {
    return
  }
  if (claim) {
    // Our own takeover came back: the session agrees, the claim is spent.
    if (state.origin_device_id === deviceId || Date.now() > claim.until) {
      claim = null
    } else if (state.active_device_id !== deviceId) {
      return
    }
  }

  lastAppliedVersion = state.version
  lastAppliedPlaying = state.playing

  await serialize(async () => {
    try {
      if (state.active_device_id === deviceId) {
        restored = true // the session itself has put us where we belong
        await becomeActive(state)
      } else if (state.active_device_id) {
        await becomePassive(state)
      } else {
        await restoreLast(state)
      }
    } catch (error) {
      console.warn('==playback: could not apply the session state', error)
    }
  })
}

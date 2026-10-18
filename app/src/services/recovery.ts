import TrackPlayer, {Track, TrackType} from 'react-native-track-player'
import {fetchTrackById} from '@/helpers/network'
import {trackKey} from '@/helpers/miscellaneous'

/**
 * Put playback back on its feet after a track failed to load.
 *
 * VK signs its m3u8 links and they age out. `services/prefetch` re-signs the
 * NEXT one 90 seconds before the hand-over, which covers the ordinary case —
 * but not a link that was already dead when the queue was built, a device that
 * woke up after hours asleep, or a network that dropped exactly there. Until
 * this existed the show simply stopped: the track ended, the next one refused
 * to load, and nothing on screen said why.
 *
 * The fix is always the same — ask the API for a fresh url and start the track
 * again — so the only real decisions here are WHICH queue entry broke and how
 * many times we are willing to try before accepting that it is not the link.
 */

/** Where the player was when it gave up. */
export type FailedAt = 'current' | 'next'

/**
 * Tries per track, so a track that is gone for good cannot spin forever.
 *
 * Four, not two. A signed VK link lives for less than one of these shows, so a
 * long mix can legitimately need re-signing more than once — and two attempts
 * inside the window were being spent on the first twenty minutes, after which
 * the show stopped for good with "giving up" in the log and nothing on screen.
 * The dedupe below is what actually keeps this from becoming a loop.
 */
const MAX_ATTEMPTS = 4

/** ...and how long a track stays remembered for that count. */
const ATTEMPT_WINDOW_MS = 5 * 60_000

/**
 * Two failures this close together are ONE failure.
 *
 * The players report a broken stream more than once — a load error and a source
 * error for the same segment — and each report used to burn an attempt. Spacing
 * them also keeps a genuinely dead track from costing four API calls inside a
 * second.
 */
const DEDUPE_MS = 750

/** A position this early is not worth restoring; the track just started. */
const RESUME_FROM_SECONDS = 3

/**
 * How long after a track change a failure still counts as "it cut this one off".
 *
 * The player advances by itself when a stream dies mid-track, and the error
 * arrives afterwards — by then its own state names the NEXT track, so reading
 * the active track gave the wrong answer and the interrupted show was never
 * resumed (issue #5).
 */
const CUT_OFF_WITHIN_MS = 10_000

/** Near enough to the end that the track simply finished. */
const FINISHED_SLACK_SECONDS = 15

const attempts = new Map<string, {count: number; at: number}>()

/**
 * Giving up on a track is not the same as giving up on the show.
 *
 * VK's own player does this: a track that will not start is left behind and the
 * next one begins. Ours used to stop dead instead — the silence the listener
 * reports as "I tap and nothing happens". Bounded, because a queue where every
 * link is dead must not be walked end to end one API call at a time.
 */
const MAX_SKIPS = 3
const SKIP_WINDOW_MS = 30_000
let skips: number[] = []

const mayMoveOn = (): boolean => {
  const now = Date.now()
  skips = skips.filter((at) => now - at < SKIP_WINDOW_MS)
  if (skips.length >= MAX_SKIPS) return false
  skips.push(now)
  return true
}

/** Leave the track that will not play and start the next one. */
const moveOn = async (key: string | undefined, why: string): Promise<boolean> => {
  if (!mayMoveOn()) {
    console.warn('==recovery: too many dead tracks in a row — stopping here')
    return false
  }
  try {
    await TrackPlayer.skipToNext()
    await TrackPlayer.play()
    console.warn('==recovery: moved past', key ?? 'a track', '—', why)
    return true
  } catch (error) {
    // the end of the queue is not a failure, it is the end of the queue
    console.warn('==recovery: nothing to move on to', (error as Error)?.message ?? error)
    return false
  }
}

/** Where the show is right now, kept from the progress ticks. */
let playing: {position: number; duration: number} = {position: 0, duration: 0}

/** The track that just left the player, and whether it had finished. */
let left: {key: string; position: number; finished: boolean; at: number} | null = null

export const __resetRecovery = (): void => {
  attempts.clear()
  skips = []
  playing = {position: 0, duration: 0}
  left = null
}

/** Fed from Event.PlaybackProgressUpdated in the playback service. */
export const notePosition = (position: number, duration: number): void => {
  playing = {position, duration}
}

/**
 * Fed from Event.PlaybackActiveTrackChanged in the playback service.
 *
 * The event is the only place that carries the track that LEFT and the position
 * it left at, and it is gone by the time an error is reported. `finished` is
 * the difference between a hand-over to protect and one to leave alone: a track
 * that ran to its end is not something to drag the listener back to.
 */
export const noteActiveTrackChanged = (event: {
  lastTrack?: Track | null
  lastPosition?: number
}): void => {
  const key = trackKey(event.lastTrack as never)
  if (!key) {
    left = null
  } else {
    const position = event.lastPosition ?? playing.position
    const duration = (event.lastTrack as {duration?: number} | null)?.duration ?? 0
    left = {
      key,
      position,
      finished: duration > 0 && position >= duration - FINISHED_SLACK_SECONDS,
      at: Date.now(),
    }
  }
  playing = {position: 0, duration: 0}
}

/**
 * Three different answers, because they mean three different things.
 *
 * `duplicate` is the same failure reported twice — the players do that — and
 * the right response is to ignore it. `exhausted` is a track that has had its
 * tries and is not coming back, which is when the show moves on. Collapsing the
 * two made a double report skip a track that was merely being re-signed.
 */
type Verdict = 'ok' | 'duplicate' | 'exhausted'

const mayTry = (key: string): Verdict => {
  const now = Date.now()
  const seen = attempts.get(key)
  if (!seen || now - seen.at > ATTEMPT_WINDOW_MS) {
    attempts.set(key, {count: 1, at: now})
    return 'ok'
  }
  if (now - seen.at < DEDUPE_MS) return 'duplicate'
  if (seen.count >= MAX_ATTEMPTS) return 'exhausted'
  attempts.set(key, {count: seen.count + 1, at: now})
  return 'ok'
}

/** The track with a freshly signed url, or null if the API cannot say. */
const resign = async (track: Track): Promise<Track | null> => {
  const ownerId = (track as {owner_id?: number | string}).owner_id
  if (ownerId == null || track.id == null) return null

  const fresh = (await fetchTrackById(ownerId, track.id as number | string)) as Track
  if (typeof fresh?.url !== 'string' || !fresh.url) return null
  return {...track, ...fresh, type: TrackType.HLS}
}

export const recoverFromPlaybackError = async (failedAt: FailedAt): Promise<boolean> => {
  try {
    const activeIndex = await TrackPlayer.getActiveTrackIndex()
    if (activeIndex == null) return false

    const queue = await TrackPlayer.getQueue()
    const activeKey = trackKey(queue[activeIndex] as never)

    // DID THE PLAYER ALREADY MOVE ON? A stream that dies mid-track makes the
    // native players advance by themselves, and the error lands after that — so
    // the active track is no longer the one that broke, and recovering "the
    // current track" recovered the one the listener never asked for while the
    // interrupted show was dropped. That is issue #5, and this is the only
    // moment the evidence still exists: the track change event remembered what
    // left, at what position, and whether it had actually finished.
    const cutOff =
      failedAt === 'current' &&
      left !== null &&
      !left.finished &&
      left.key !== activeKey &&
      Date.now() - left.at < CUT_OFF_WITHIN_MS

    const index = cutOff
      ? queue.findIndex((item) => trackKey(item as never) === left!.key)
      : failedAt === 'next'
        ? activeIndex + 1
        : activeIndex
    if (index < 0) return false

    const broken = queue[index]
    if (!broken) return false

    const key = trackKey(broken as never)
    const verdict = key ? mayTry(key) : 'duplicate'
    if (verdict === 'duplicate') return false
    if (verdict === 'exhausted') {
      console.warn('==recovery: giving up on', key)
      return await moveOn(key, 'it has failed too many times')
    }

    // Where to come back to. A hand-over that never happened has nothing to
    // resume from; a track that was cut off resumes where it was cut, and the
    // player's own progress is no use for it — it belongs to the track that
    // took over. For the ordinary in-place failure the remembered tick is the
    // backstop, because a player that has just errored can report 0.
    const progress = failedAt === 'current' ? (await TrackPlayer.getProgress()).position : 0
    const position = cutOff
      ? left!.position
      : failedAt === 'current'
        ? Math.max(progress, playing.position)
        : 0

    const fixed = await resign(broken)
    if (!fixed) return await moveOn(key, 'VK has no stream for it')

    if (failedAt === 'current' && !cutOff) {
      // `load` replaces what the player holds without touching the queue —
      // removing the ACTIVE entry instead is what the platforms disagree about
      // most, and the queue is right, it is the link that is stale.
      await TrackPlayer.load(fixed)
      if (position > RESUME_FROM_SECONDS) await TrackPlayer.seekTo(position)
    } else {
      // Not the active track, so it can be swapped in the queue. Added before
      // the old one is removed: a queue that momentarily ends after the active
      // track is enough for the player to decide the show is over.
      await TrackPlayer.add(fixed, index)
      await TrackPlayer.remove(index + 1)
      await TrackPlayer.skip(index)
      // Going BACK to a track the player had already left: it starts from the
      // top, so the position has to be restored explicitly.
      if (position > RESUME_FROM_SECONDS) await TrackPlayer.seekTo(position)
    }

    // The failure is spent: its evidence must not make the NEXT error look like
    // a cut-off of a track that is long gone.
    if (cutOff) left = null

    await TrackPlayer.play()
    console.debug(
      '==recovery: restarted',
      key,
      cutOff ? 'the player had already skipped past it' : `after a ${failedAt} failure`,
      position > RESUME_FROM_SECONDS ? `at ${Math.round(position)}s` : 'from the top',
    )
    return true
  } catch (error) {
    console.warn('==recovery: could not restart playback', error)
    return false
  }
}

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

/** Tries per track, so a track that is gone for good cannot spin forever. */
const MAX_ATTEMPTS = 2

/** ...and how long a track stays remembered for that count. */
const ATTEMPT_WINDOW_MS = 5 * 60_000

/** A position this early is not worth restoring; the track just started. */
const RESUME_FROM_SECONDS = 3

const attempts = new Map<string, {count: number; at: number}>()

export const __resetRecovery = (): void => {
  attempts.clear()
}

const mayTry = (key: string): boolean => {
  const now = Date.now()
  const seen = attempts.get(key)
  if (!seen || now - seen.at > ATTEMPT_WINDOW_MS) {
    attempts.set(key, {count: 1, at: now})
    return true
  }
  if (seen.count >= MAX_ATTEMPTS) return false
  attempts.set(key, {count: seen.count + 1, at: now})
  return true
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
    const index = failedAt === 'next' ? activeIndex + 1 : activeIndex
    const broken = queue[index]
    if (!broken) return false

    const key = trackKey(broken as never)
    if (!key || !mayTry(key)) {
      console.warn('==recovery: giving up on', key)
      return false
    }

    // Only the track that was already playing has a position worth keeping: a
    // hand-over that never happened has nothing to resume from.
    const position =
      failedAt === 'current' ? (await TrackPlayer.getProgress()).position : 0

    const fixed = await resign(broken)
    if (!fixed) return false

    if (failedAt === 'current') {
      // `load` replaces what the player holds without touching the queue —
      // removing the ACTIVE entry instead is what the platforms disagree about
      // most, and the queue is right, it is the link that is stale.
      await TrackPlayer.load(fixed)
      if (position > RESUME_FROM_SECONDS) await TrackPlayer.seekTo(position)
    } else {
      // Not playing, so it can be swapped in the queue. Added before the old
      // one is removed: a queue that momentarily ends after the active track is
      // enough for the player to decide the show is over.
      await TrackPlayer.add(fixed, index)
      await TrackPlayer.remove(index + 1)
      await TrackPlayer.skip(index)
    }

    await TrackPlayer.play()
    console.debug('==recovery: restarted', key, 'after a', failedAt, 'failure')
    return true
  } catch (error) {
    console.warn('==recovery: could not restart playback', error)
    return false
  }
}

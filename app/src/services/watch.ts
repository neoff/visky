import TrackPlayer, {Event, State, Track} from 'react-native-track-player'
import {trackKey} from '@/helpers/miscellaneous'
import {SONGS_CACHE_KEY, cachedTracks} from '@/store/library'
import {WatchBridge, WatchCommand, WatchQueueItem, WatchSnapshot} from '../../modules/watch-bridge'

/**
 * The phone side of the Apple Watch app.
 *
 * Lives in the playback service, not in a hook, for the same reason the
 * prefetch does: the watch is used precisely when the phone's screen is off and
 * the app is in the user's pocket. A listener mounted by a screen would be gone
 * exactly when it is needed.
 *
 * What the watch can and cannot do is worth being clear about. It sends
 * commands to a RUNNING phone app. While audio plays the app is alive and every
 * command works; once the app has been swiped away nothing can start it
 * remotely — the same limitation the "Play on" device list documents. The watch
 * shows the last state it was given rather than pretending otherwise.
 */

/** The playlist can be hundreds of tracks; the watch is a list you thumb through. */
const QUEUE_LIMIT = 60

/**
 * A floor on how often the context is replaced. Progress updates arrive every
 * 10 s (see useSetupTrackPlayer) and a state change can arrive in a burst;
 * WCSession quietly throttles a sender that pushes too hard, and the state that
 * matters is the newest one, not all of them.
 */
const MIN_PUBLISH_MS = 2_000

let lastPublishAt = 0
let pending: ReturnType<typeof setTimeout> | null = null
let started = false

const toQueueItem = (track: Track): WatchQueueItem | null => {
  const id = trackKey(track as never)
  if (!id) return null
  return {
    id,
    title: track.title ?? 'Unknown',
    ...(track.artist ? {artist: track.artist} : {}),
  }
}

/**
 * What the watch's Playlist screen lists.
 *
 * The PLAYLIST, not the player's queue. The queue is usually one track long —
 * whatever was last tapped — and a wrist list of one item is not worth the
 * scroll. `songs-window` is the same MMKV key the Songs tab seeds itself from,
 * so the watch shows what the phone shows. The live queue is the fallback for a
 * fresh install that has never opened the tab, where something beats nothing.
 */
const playlist = async (queue: Track[]): Promise<Track[]> => {
  const songs = await cachedTracks(SONGS_CACHE_KEY)
  return songs.length ? (songs as Track[]) : queue
}

const snapshot = async (): Promise<WatchSnapshot> => {
  const [{state}, progress, queue, index] = await Promise.all([
    TrackPlayer.getPlaybackState(),
    TrackPlayer.getProgress(),
    TrackPlayer.getQueue(),
    TrackPlayer.getActiveTrackIndex(),
  ])

  const active = index == null ? undefined : queue[index]
  const list = await playlist(queue)

  return {
    v: 1,
    playing: state === State.Playing || state === State.Buffering,
    ...(active?.title ? {title: active.title} : {}),
    ...(active?.artist ? {artist: active.artist} : {}),
    ...(active ? {trackId: trackKey(active as never) ?? undefined} : {}),
    position: progress.position,
    duration: progress.duration,
    at: Date.now(),
    queue: list.slice(0, QUEUE_LIMIT).map(toQueueItem).filter(Boolean) as WatchQueueItem[],
  }
}

/**
 * @param immediate for the events the user is watching happen — a track change,
 * a play/pause — where two seconds of stale UI on the wrist is the whole
 * complaint.
 */
export const publishToWatch = async (immediate = false): Promise<void> => {
  if (!WatchBridge.isAvailable) return

  const since = Date.now() - lastPublishAt
  if (!immediate && since < MIN_PUBLISH_MS) {
    // Coalesce: keep exactly one deferred publish, so a burst of progress
    // events costs one message, not five.
    if (!pending) {
      pending = setTimeout(() => {
        pending = null
        void publishToWatch(true)
      }, MIN_PUBLISH_MS - since)
    }
    return
  }

  if (pending) {
    clearTimeout(pending)
    pending = null
  }
  lastPublishAt = Date.now()

  try {
    await WatchBridge.publish(await snapshot())
  } catch (error) {
    console.warn('==watch: publish failed', error)
  }
}

const handleCommand = async (command: WatchCommand): Promise<void> => {
  console.log('==watch: command', command.command)
  try {
    switch (command.command) {
      case 'play':
        await TrackPlayer.play()
        break
      case 'pause':
        await TrackPlayer.pause()
        break
      case 'toggle': {
        const {state} = await TrackPlayer.getPlaybackState()
        const playing = state === State.Playing || state === State.Buffering
        await (playing ? TrackPlayer.pause() : TrackPlayer.play())
        break
      }
      case 'next':
        await TrackPlayer.skipToNext()
        break
      case 'previous':
        await TrackPlayer.skipToPrevious()
        break
      case 'playTrack': {
        // Already loaded? Move within the queue, so whatever the user lined up
        // on the phone survives and resuming costs one skip.
        const queue = await TrackPlayer.getQueue()
        const queued = queue.findIndex((track) => trackKey(track as never) === command.trackId)
        if (queued >= 0) {
          await TrackPlayer.skip(queued)
          await TrackPlayer.play()
          break
        }

        // Otherwise the row came from the playlist the watch was sent, so load
        // that playlist and start there — a tap on the wrist means "play my
        // list from here", not "play this one track and fall silent".
        const list = await playlist(queue)
        const index = list.findIndex((track) => trackKey(track as never) === command.trackId)
        if (index < 0) {
          // The watch is showing a list that has since been replaced. Say
          // nothing to the user, but do not skip to a random track either.
          console.warn('==watch: asked for a track that is no longer in the playlist')
          break
        }
        await TrackPlayer.setQueue(list)
        await TrackPlayer.skip(index)
        await TrackPlayer.play()
        break
      }
      case 'refresh':
        break
    }
  } catch (error) {
    console.warn('==watch: command failed', error)
  }

  // Always answer with the truth, including after a command that failed — the
  // watch's buttons are optimistic and this is what corrects them.
  await publishToWatch(true)
}

/** Called once, from the playback service. */
export const startWatchLink = (): void => {
  if (started || !WatchBridge.isAvailable) return
  started = true

  WatchBridge.addCommandListener((command) => {
    void handleCommand(command)
  })

  // A watch that just became reachable, or was just installed, has nothing to
  // show until the next event. Push immediately instead of waiting for one.
  WatchBridge.addStatusListener((status) => {
    if (status.reachable) void publishToWatch(true)
  })

  TrackPlayer.addEventListener(Event.PlaybackState, () => {
    void publishToWatch(true)
  })
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    void publishToWatch(true)
  })
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
    void publishToWatch()
  })

  void publishToWatch(true)
}

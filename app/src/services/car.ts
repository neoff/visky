import TrackPlayer, {Event, State, Track} from 'react-native-track-player'
import {trackKey} from '@/helpers/miscellaneous'
import {
  FAVORITES_CACHE_KEY,
  SONGS_CACHE_KEY,
  cachedTracks,
} from '@/store/library'
import {
  CAR_ARTISTS,
  CAR_FAVORITES,
  CAR_SONGS,
  CAR_ROOT,
  Car,
  CarCommand,
  CarNode,
  CarTree,
  carTrackId,
  parseCarTrackId,
} from '../../modules/car'

/**
 * The phone side of CarPlay and Android Auto.
 *
 * Lives in the playback service for the same reason the watch link does: a car
 * is used with the phone in a pocket or a cradle and the app in the background.
 * A listener mounted by a screen would be unmounted exactly when the driver
 * starts reaching for the head unit.
 *
 * WHAT A DRIVER GETS, and why it is less than the app.
 *
 * Three roots — the songs playlist, favourites, artists, mirroring the app's own
 * tabs — and one level under artists.
 * Apple rejects CarPlay apps whose hierarchy is deep enough to read while
 * moving, and Android Auto enforces its own limits at runtime. So the shallow
 * tree is the product, not a shortcut. Search, playlists and anything needing a
 * keyboard stay on the phone.
 *
 * Only the tree is published. Title, artwork, progress and the transport
 * buttons come from react-native-track-player, which already keeps
 * MPNowPlayingInfoCenter and the Android MediaSession filled — both head units
 * read those directly.
 */

/** Per-list caps. Both head units truncate long lists anyway; doing it here
 *  keeps the published tree small enough to push on every change. */
const SONGS_LIMIT = 100
const FAVORITES_LIMIT = 100
const ARTIST_LIMIT = 60
const ARTIST_TRACK_LIMIT = 40

/**
 * A floor on how often the tree is rebuilt. Building it walks the whole
 * library, and a burst of playback events would otherwise do that several times
 * in a second for a tree that ends up identical apart from one `nowPlaying`
 * flag.
 */
const MIN_PUBLISH_MS = 2_000

const ARTIST_PREFIX = 'artist:'

let lastPublishAt = 0
let pending: ReturnType<typeof setTimeout> | null = null
let started = false

type LibraryTrack = Track & {owner_id?: number}

const toNode = (
  containerId: string,
  track: LibraryTrack,
  activeKey: string | undefined,
): CarNode | null => {
  const key = trackKey(track as never)
  if (!key) return null
  return {
    id: carTrackId(containerId, key),
    title: track.title ?? 'Unknown',
    ...(track.artist ? {subtitle: track.artist} : {}),
    ...(track.artwork ? {artwork: String(track.artwork)} : {}),
    playable: true,
    browsable: false,
    ...(key === activeKey ? {nowPlaying: true} : {}),
  }
}

const nodesFor = (
  containerId: string,
  tracks: LibraryTrack[],
  limit: number,
  activeKey: string | undefined,
): CarNode[] =>
  tracks
    .slice(0, limit)
    .map((track) => toNode(containerId, track, activeKey))
    .filter(Boolean) as CarNode[]

const artistOf = (track: LibraryTrack): string => track.artist?.trim() || 'Unknown'

/**
 * WHERE THE LIBRARY COMES FROM, and why it is not a store.
 *
 * The tabs load their lists in a sliding window and mirror the first page into
 * MMKV — `songs-window` and `favorites-window` — so a cold start has something
 * to draw before the network answers. Those two keys are the only complete,
 * current picture of what the user's app is showing, so they are what the car
 * shows too.
 *
 * This used to read `useLibraryStore`, whose `tracks` come from a `'tracks'`
 * key that nothing has written since the tabs moved to windowed loading. It
 * resolved to an empty array, so Favorites and Artists in the car were empty on
 * every single trip — silently, because an empty list is a valid list. Found on
 * the CarPlay simulator: three tabs, correct icons, and nothing under two of
 * them.
 */
const library = async (): Promise<{songs: LibraryTrack[]; favorites: LibraryTrack[]}> => {
  const [songs, favorites] = await Promise.all([
    cachedTracks(SONGS_CACHE_KEY),
    cachedTracks(FAVORITES_CACHE_KEY),
  ])
  return {songs: songs as LibraryTrack[], favorites: favorites as LibraryTrack[]}
}

/**
 * Which track to mark as playing, or nothing.
 *
 * A head unit can be plugged in before anything has ever played, and every
 * TrackPlayer query throws until `setupPlayer` has run. Letting that reject
 * would fail the whole tree and leave the car showing a placeholder forever —
 * which is exactly what it did before this existed. Nothing marked and a full
 * playlist is a perfectly good car screen.
 */
const playerState = async (): Promise<{activeKey?: string}> => {
  try {
    const [queue, index] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrackIndex(),
    ])
    const active = index == null ? undefined : queue[index]
    return {activeKey: active ? trackKey(active as never) : undefined}
  } catch {
    return {}
  }
}

const buildTree = async (): Promise<CarTree> => {
  const [{activeKey}, {songs: tracks, favorites}] = await Promise.all([playerState(), library()])

  const children: Record<string, CarNode[]> = {}

  children[CAR_SONGS] = nodesFor(CAR_SONGS, tracks, SONGS_LIMIT, activeKey)
  children[CAR_FAVORITES] = nodesFor(CAR_FAVORITES, favorites, FAVORITES_LIMIT, activeKey)

  const byArtist = new Map<string, LibraryTrack[]>()
  for (const track of tracks) {
    const name = artistOf(track)
    const bucket = byArtist.get(name)
    if (bucket) bucket.push(track)
    else byArtist.set(name, [track])
  }

  const names = [...byArtist.keys()].sort((a, b) => a.localeCompare(b)).slice(0, ARTIST_LIMIT)

  children[CAR_ARTISTS] = names.map((name) => {
    const owned = byArtist.get(name) ?? []
    const containerId = `${ARTIST_PREFIX}${name}`
    children[containerId] = nodesFor(containerId, owned, ARTIST_TRACK_LIMIT, activeKey)
    return {
      id: containerId,
      title: name,
      subtitle: `${owned.length} ${owned.length === 1 ? 'track' : 'tracks'}`,
      ...(owned[0]?.artwork ? {artwork: String(owned[0].artwork)} : {}),
      playable: false,
      browsable: true,
    }
  })

  children[CAR_ROOT] = [
    {id: CAR_SONGS, title: 'Songs', playable: false, browsable: true},
    {id: CAR_FAVORITES, title: 'Favorites', playable: false, browsable: true},
    {id: CAR_ARTISTS, title: 'Artists', playable: false, browsable: true},
  ]

  return {v: 1, children}
}

/**
 * @param immediate for what the driver is watching happen — a track change, a
 * play/pause — where two seconds of a stale row on the dashboard is the whole
 * complaint.
 */
export const publishCarTree = async (immediate = false): Promise<void> => {
  if (!Car.isAvailable) return

  const since = Date.now() - lastPublishAt
  if (!immediate && since < MIN_PUBLISH_MS) {
    // Coalesce: keep exactly one deferred publish, so a burst of events costs
    // one tree rebuild rather than five.
    if (!pending) {
      pending = setTimeout(() => {
        pending = null
        void publishCarTree(true)
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
    const tree = await buildTree()
    // The native side rejects a tree it cannot read and says so by returning
    // false. Without this line that rejection is invisible from JS and shows
    // up only as a head unit stuck on its placeholder.
    const accepted = await Car.publishTree(tree)
    if (!accepted) {
      console.warn('==car: native side rejected the tree', Object.keys(tree.children).length, 'nodes')
    }
  } catch (error) {
    console.warn('==car: tree publish failed', error)
  }
}

/**
 * Playing a node means playing its CONTAINER, starting at that node. A driver
 * who taps the third song in Favorites expects the rest of the list to follow,
 * not silence after one track.
 */
const playNode = async (nodeId: string): Promise<void> => {
  const parsed = parseCarTrackId(nodeId)
  if (!parsed) {
    console.warn('==car: unplayable node', nodeId)
    return
  }

  const {containerId, trackKey: wanted} = parsed

  // Already queued? Move within the queue instead of replacing it. This is not
  // an optimisation: whatever the user lined up on the phone survives, and the
  // common case in a car — resuming the list that is already loaded — costs one
  // skip rather than a full reload.
  const queue = await TrackPlayer.getQueue()
  const queued = queue.findIndex((track) => trackKey(track as never) === wanted)
  if (queued >= 0) {
    await TrackPlayer.skip(queued)
    await TrackPlayer.play()
    return
  }

  const {songs, favorites} = await library()
  const container =
    containerId === CAR_SONGS
      ? songs
      : containerId === CAR_FAVORITES
        ? favorites
        : containerId.startsWith(ARTIST_PREFIX)
          ? songs.filter((track) => artistOf(track) === containerId.slice(ARTIST_PREFIX.length))
          : []

  const index = container.findIndex((track) => trackKey(track as never) === wanted)
  if (index < 0) {
    console.warn('==car: track not found in', containerId)
    return
  }

  await TrackPlayer.setQueue(container as Track[])
  await TrackPlayer.skip(index)
  await TrackPlayer.play()
}

const handleCommand = async (command: CarCommand): Promise<void> => {
  console.log('==car: command', command.command)
  try {
    switch (command.command) {
      case 'play':
        await playNode(command.nodeId)
        break
      case 'playPause': {
        const {state} = await TrackPlayer.getPlaybackState()
        const playing = state === State.Playing || state === State.Buffering
        await (playing ? TrackPlayer.pause() : TrackPlayer.play())
        break
      }
      case 'resume':
        await TrackPlayer.play()
        break
      case 'pause':
        await TrackPlayer.pause()
        break
      case 'next':
        await TrackPlayer.skipToNext()
        break
      case 'previous':
        await TrackPlayer.skipToPrevious()
        break
      case 'refresh':
        break
    }
  } catch (error) {
    console.warn('==car: command failed', error)
  }

  // Answer with the truth even after a command that failed — the head unit's
  // rows are optimistic and this is what corrects them.
  await publishCarTree(true)
}

/**
 * Idempotent, and called from TWO places on purpose.
 *
 * The playback service calls it because that is where the player's events are
 * and where a backgrounded app still runs. The root layout calls it because a
 * head unit can be connected before anything has ever played — and the playback
 * service does not exist until `setupPlayer` has run. Registering only there
 * meant a driver who plugged in before pressing play got a placeholder that
 * never resolved. Whichever call lands first wins; the other returns here.
 */
export const startCarLink = (): void => {
  if (started) return
  if (!Car.isAvailable) {
    // Expected on web and on Android before the module ships; anywhere else it
    // means the native module did not register, and the car will sit on its
    // placeholder with no other symptom.
    console.log('==car: native module absent, link not started')
    return
  }
  started = true
  console.log('==car: link started')

  Car.addCommandListener((command) => {
    void handleCommand(command)
  })

  // A head unit that just connected holds nothing, and it may have connected
  // before JS was up. Push immediately rather than waiting for an event.
  Car.addStatusListener((status) => {
    if (status.connected) void publishCarTree(true)
  })

  TrackPlayer.addEventListener(Event.PlaybackState, () => {
    void publishCarTree()
  })
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    void publishCarTree(true)
  })

  void publishCarTree(true)
}

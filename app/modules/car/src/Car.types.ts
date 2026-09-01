/**
 * The wire format between JS and the two car head units.
 *
 * ONE tree, two consumers: CarPlay's CPListTemplate on iOS and Android Auto's
 * MediaBrowserService browse tree. They render differently but ask the same
 * question — "what is under this node, and what happens if I tap it" — so the
 * format is shared and each native side maps it to its own widgets.
 *
 * WHY THE WHOLE TREE IS PUSHED, not fetched node by node.
 *
 * A request/response bridge would be the obvious design and it is the wrong one
 * here. Android Auto calls `onLoadChildren` from the system, on its own
 * schedule, including while the app is backgrounded and JS is idle; CarPlay
 * expects a list template to be populated the instant it is pushed. Waiting on
 * a round trip to JS in either case shows the driver a spinner. So JS publishes
 * the entire tree the same way it publishes the watch snapshot, the native side
 * keeps it, and browsing is a local lookup that cannot stall.
 *
 * That only works because the tree is deliberately small — see the caps in
 * services/car.ts. It is a driving UI, not the library.
 */

/** Stable ids the native sides may special-case. Everything else is opaque. */
export const CAR_ROOT = 'root'
/**
 * The playlist, which is what the driver came for.
 *
 * This root used to be the LIVE PLAYER QUEUE, titled "Now playing". In a car
 * that is close to useless: the queue is usually one track long, or holds
 * whatever was last tapped, and the driver who opens the app wants the list
 * they have on the phone. The Now Playing screen already shows what is playing
 * — CarPlay gives it its own template and the head unit reaches it on its own.
 */
export const CAR_SONGS = 'songs'
export const CAR_FAVORITES = 'favorites'
export const CAR_ARTISTS = 'artists'

/**
 * A track node's id is `${containerId}#${trackKey}`.
 *
 * The container half is not decoration. Tapping a song under "Favorites" in a
 * car means "play my favourites, starting here" — not "play this one song and
 * then fall silent". The command handler needs to know which list the driver
 * was looking at, and the node id is the only thing that survives the trip
 * through the head unit.
 *
 * The container half is PERCENT-ENCODED, the track half is not. Both halves can
 * legitimately contain a `#` — an artist container is `artist:${name}` and names
 * are arbitrary, and a track key falls back to the track's URL when it has no
 * id, which may carry a fragment. Splitting a raw `a#b` on the first or the last
 * `#` therefore gets one of those cases wrong. Encoding one side makes the
 * FIRST `#` the separator by construction, whatever is on either side of it.
 *
 * The id is opaque to both native halves — they only ever hand it back — so this
 * encoding is JS's business alone and changing it is not a wire format change.
 */
export const carTrackId = (containerId: string, trackKey: string): string =>
  `${encodeURIComponent(containerId)}#${trackKey}`

export const parseCarTrackId = (
  nodeId: string,
): {containerId: string; trackKey: string} | null => {
  const at = nodeId.indexOf('#')
  if (at <= 0 || at === nodeId.length - 1) return null
  try {
    return {
      containerId: decodeURIComponent(nodeId.slice(0, at)),
      trackKey: nodeId.slice(at + 1),
    }
  } catch {
    // A malformed escape means this id did not come from carTrackId.
    return null
  }
}

export interface CarNode {
  id: string
  title: string
  subtitle?: string
  /** Remote URL. Both head units fetch and cache it themselves. */
  artwork?: string
  /** Tapping starts playback of this node's container, at this node. */
  playable: boolean
  /** Tapping opens `children[id]`. A node may be neither, never both. */
  browsable: boolean
  /**
   * This row is the track playing right now, so the head unit can mark it.
   *
   * It rides on the tree rather than on a second channel because the tree is
   * already rebuilt on every track change, and because the transport itself —
   * title, artwork, progress, the Now Playing screen — comes from somewhere
   * else entirely: react-native-track-player keeps MPNowPlayingInfoCenter and
   * the Android MediaSession filled, and both head units read those directly.
   * Publishing our own now-playing state would be a second source of truth for
   * something neither platform would look at.
   */
  nowPlaying?: boolean
}

export interface CarTree {
  /** Bumped when the shape changes; a native side ignores what it cannot read. */
  v: 1
  /** Node lists by parent id, including CAR_ROOT. Flat on purpose: the head
   *  units look children up by id, so nesting would only cost a walk. */
  children: Record<string, CarNode[]>
}

export type CarCommand =
  | {command: 'play'; nodeId: string}
  | {command: 'playPause'}
  /**
   * Explicit, and NOT the same as `playPause`.
   *
   * A head unit's transport is a MediaSession callback: `onPlay` and `onPause`
   * are separate and each means what it says. Folding them into a toggle gets
   * it wrong exactly when the car and the phone disagree about the current
   * state — the driver presses play on a stream that is already playing and it
   * stops. The watch has had `play`/`pause`/`toggle` from the start for the
   * same reason.
   */
  | {command: 'resume'}
  | {command: 'pause'}
  | {command: 'next'}
  | {command: 'previous'}
  /** The head unit just connected and holds nothing. */
  | {command: 'refresh'}

export interface CarStatus {
  /** A head unit is attached right now. */
  connected: boolean
}

export type CarEvents = {
  onCarCommand: (command: CarCommand) => void
  onCarStatus: (status: CarStatus) => void
}

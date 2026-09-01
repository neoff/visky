/**
 * The wire format between the phone and the watch.
 *
 * Written down once, here, and mirrored by hand in
 * `watch/WatchLink.swift`. It crosses a process AND a device boundary, so it
 * changes the way a network protocol changes — both sides, deliberately — not
 * the way a shared type does.
 */

/** Phone -> watch. Sent as the WCSession application context. */
export interface WatchSnapshot {
  /** Bumped when the shape changes; the watch ignores anything it cannot read. */
  v: 1
  playing: boolean
  title?: string
  artist?: string
  /** `${owner_id}_${id}` — the same key the queue entries carry */
  trackId?: string
  /** seconds, as of `at` */
  position?: number
  duration?: number
  /** epoch ms on the PHONE's clock, so the watch can age the position */
  at: number
  queue: WatchQueueItem[]
}

export interface WatchQueueItem {
  id: string
  title: string
  artist?: string
}

/** Watch -> phone. */
export type WatchCommand =
  | {command: 'play'}
  | {command: 'pause'}
  | {command: 'toggle'}
  | {command: 'next'}
  | {command: 'previous'}
  | {command: 'playTrack'; trackId: string}
  /** The watch app just came up and has nothing to show. */
  | {command: 'refresh'}

export interface WatchStatus {
  /** false on iPad, on the simulator without a paired watch, and on Android */
  supported: boolean
  paired: boolean
  installed: boolean
  /** the watch app is in the foreground right now */
  reachable: boolean
}

export type WatchBridgeEvents = {
  onWatchCommand: (command: WatchCommand) => void
  onWatchStatus: (status: WatchStatus) => void
}

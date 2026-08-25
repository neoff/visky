/**
 * Mirror of the API's playback contract (`api/src/types/playback.ts`).
 *
 * Kept as a hand-written copy on purpose: it is a wire format, so it changes
 * with a version bump on both sides rather than silently through a shared build.
 */

export interface PlaybackTrackRef {
  /** `${owner_id}_${id}` — the same key `trackKey()` produces locally */
  track_id: string
  owner_id: number
  id: number
  title?: string
  artist?: string
  artwork?: string
  /** seconds */
  duration?: number
}

export interface PlaybackContext {
  kind: 'frisky' | 'favorites' | 'playlist' | 'search' | 'unknown'
  playlist_id?: string | number | null
  index?: number | null
  query?: string | null
}

export interface PlaybackState {
  user_id: string
  active_device_id: string | null
  track: PlaybackTrackRef | null
  context: PlaybackContext | null
  /** the position that was true at `updated_at_ms` — not "now" */
  position_ms: number
  playing: boolean
  /** SERVER clock */
  updated_at_ms: number
  version: number
  origin_device_id: string | null
}

export interface PlaybackDeviceInfo {
  device_id: string
  name: string | null
  platform: string | null
  app_version?: string | null
  online: boolean
  is_active: boolean
  last_seen_ms: number | null
  can_wake: boolean
}

export interface PlaybackUpdate {
  track?: PlaybackTrackRef | null
  context?: PlaybackContext | null
  position_ms?: number
  playing?: boolean
  version?: number
}

export type ServerFrame =
  | {t: 'state'; state: PlaybackState; server_now_ms: number}
  | {t: 'devices'; devices: PlaybackDeviceInfo[]; server_now_ms: number}
  | {t: 'pong'; client_now_ms?: number; server_now_ms: number}
  | {t: 'error'; message: string}

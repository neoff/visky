// src/types/playback.ts
//
// The wire contract for cross-device playback. Shared by the REST routes, the
// WebSocket hub and the Kafka records — one shape, so a state snapshot read
// back from the compacted topic is literally what a device receives.

/** A track as the state remembers it: ids to re-resolve it, plus enough to draw a row. */
export interface PlaybackTrackRef {
  /** `${owner_id}_${id}` — VK's own addressing, and the key of everything here */
  track_id: string;
  owner_id: number;
  id: number;
  title?: string;
  artist?: string;
  artwork?: string;
  /** seconds, as VK reports it */
  duration?: number;
}

/** Where the track came from, so the receiving device can rebuild the queue. */
export interface PlaybackContext {
  kind: "frisky" | "favorites" | "playlist" | "search" | "unknown";
  playlist_id?: string | number | null;
  /** position of the track inside that list, when known */
  index?: number | null;
  query?: string | null;
}

/**
 * The server-authoritative playback state of ONE user.
 *
 * `position_ms` is not "the current position" — it is the position that was
 * true at `updated_at_ms` (server clock). Anyone who needs "now" extrapolates:
 * playing ? position_ms + (now - updated_at_ms) : position_ms. That is what
 * keeps two devices in sync without either of them trusting its own clock.
 *
 * `version` is monotonic per user and is the only conflict rule: an update that
 * carries an older version than the one held is dropped.
 */
export interface PlaybackState {
  user_id: string;
  /** the device that owns the sound right now; null = nothing is playing anywhere */
  active_device_id: string | null;
  track: PlaybackTrackRef | null;
  context: PlaybackContext | null;
  position_ms: number;
  playing: boolean;
  /** server time (ms) `position_ms` refers to */
  updated_at_ms: number;
  version: number;
  /** which device produced this revision (for logs and for echo suppression) */
  origin_device_id: string | null;
}

/** What a device may ask the server to record. */
export interface PlaybackUpdate {
  track?: PlaybackTrackRef | null;
  context?: PlaybackContext | null;
  position_ms?: number;
  playing?: boolean;
  /** the version the device believed it was updating; older than ours = dropped */
  version?: number;
}

export interface PlaybackDeviceInfo {
  device_id: string;
  name: string | null;
  platform: string | null;
  app_version?: string | null;
  /** a live WebSocket exists right now */
  online: boolean;
  /** this device owns the sound */
  is_active: boolean;
  last_seen_ms: number | null;
  /** has a push token: can be woken from a dead socket (best effort) */
  can_wake: boolean;
}

/** Append-only history: what happened, where. */
export interface PlaybackEvent {
  type: "play" | "pause" | "seek" | "track" | "transfer" | "device_online" | "device_offline";
  user_id: string;
  device_id: string | null;
  target_device_id?: string | null;
  track_id?: string | null;
  position_ms?: number;
  at_ms: number;
  version: number;
}

/** Client → server frames. */
export type ClientFrame =
  | {t: "hello"; device_id: string; name?: string; platform?: string; app_version?: string; push_token?: string}
  | {t: "progress"; position_ms: number; playing: boolean; track_id?: string; version?: number}
  | {t: "update"; update: PlaybackUpdate}
  | {t: "transfer"; to_device_id: string; play?: boolean}
  | {t: "ping"; client_now_ms?: number};

/** Server → client frames. */
export type ServerFrame =
  | {t: "state"; state: PlaybackState; server_now_ms: number}
  | {t: "devices"; devices: PlaybackDeviceInfo[]; server_now_ms: number}
  | {t: "pong"; client_now_ms?: number; server_now_ms: number}
  // Metadata for these tracks (`${owner_id}_${id}`) has just arrived from
  // frisky.fm. Nothing about playback changed — it is the app's cue to re-read
  // the list it is showing, so a tracklist appears without waiting for a manual
  // pull-to-refresh. Ignoring the frame is harmless.
  | {t: "catalog"; track_ids: string[]; server_now_ms: number}
  | {t: "error"; message: string};

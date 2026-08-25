// src/services/playback.ts
//
// The server-authoritative playback session — one per VK account.
//
// Two rules carry the whole feature:
//
//  1. POSITION IS A FUNCTION, NOT A NUMBER. The state stores the position that
//     was true at `updated_at_ms` (server clock). "Where is it now" is
//     position_ms + (now - updated_at_ms) while playing. Devices never compare
//     their own clocks with each other, so no clock skew can leak into a
//     transfer: the receiving device seeks to a position the SERVER computed.
//
//  2. `version` decides. Every accepted change bumps it; anything arriving with
//     an older version is a straggler from a device that has not caught up yet
//     and is dropped. This is also what makes the Kafka loopback harmless — our
//     own record comes back and is ignored.
import {playback as cfg} from "@/configurations/playback";
import {publishEvent, publishState} from "@/services/kafka";
import {PlaybackEvent, PlaybackState, PlaybackUpdate} from "@/types/playback";

const states = new Map<string, PlaybackState>();
type Listener = (state: PlaybackState) => void;
const listeners = new Set<Listener>();

/** Pending "the active device went quiet" freezes, keyed by user id. */
const freezes = new Map<string, NodeJS.Timeout>();

export const emptyState = (userId: string): PlaybackState => ({
  user_id: userId,
  active_device_id: null,
  track: null,
  context: null,
  position_ms: 0,
  playing: false,
  updated_at_ms: Date.now(),
  version: 0,
  origin_device_id: null,
});

export const getState = (userId: string): PlaybackState => states.get(userId) ?? emptyState(userId);

/**
 * Where the track actually is at `nowMs`, given a state snapshot.
 *
 * Capped at the track's length: a state that says "playing" while nobody is
 * reporting (the API restarted, the phone died) would otherwise project a
 * position past the end of the show and make the next device seek into nothing.
 */
export const projectPosition = (state: PlaybackState, nowMs: number = Date.now()): number => {
  if (!state.playing) return state.position_ms;
  const projected = Math.max(0, state.position_ms + (nowMs - state.updated_at_ms));
  const durationMs = state.track?.duration ? state.track.duration * 1000 : null;
  return durationMs ? Math.min(projected, durationMs) : projected;
};

export const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = (state: PlaybackState): void => {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error("==playback: listener failed:", (error as Error)?.message ?? error);
    }
  }
};

const record = (event: Omit<PlaybackEvent, "at_ms">): void => {
  void publishEvent({...event, at_ms: Date.now()});
};

/** Store, publish to Kafka, push to every socket of this user. */
const commit = (state: PlaybackState): PlaybackState => {
  states.set(state.user_id, state);
  void publishState(state);
  notify(state);
  return state;
};

/**
 * A snapshot that arrived from Kafka — either another replica's change or our
 * own coming back around. Older or equal versions are dropped, so this is safe
 * to call with anything.
 */
export const applyRemoteState = (incoming: PlaybackState): void => {
  const current = states.get(incoming.user_id);
  if (current && incoming.version <= current.version) return;
  states.set(incoming.user_id, incoming);
  notify(incoming);
};

/**
 * A device says: this is what I am playing.
 *
 * Reporting a track or a play makes the reporting device the active one — that
 * is how "press play on the phone" takes the sound back from the tablet,
 * without any explicit transfer.
 */
export const applyUpdate = (
  userId: string,
  deviceId: string,
  update: PlaybackUpdate,
): PlaybackState => {
  const current = getState(userId);
  if (update.version !== undefined && update.version < current.version) {
    // the device is behind; hand it the truth instead of taking its word
    return current;
  }

  const takesOver = update.track !== undefined || update.playing === true;
  const next: PlaybackState = {
    ...current,
    track: update.track !== undefined ? update.track : current.track,
    context: update.context !== undefined ? update.context : current.context,
    position_ms: update.position_ms !== undefined ? Math.max(0, update.position_ms) : projectPosition(current),
    playing: update.playing !== undefined ? update.playing : current.playing,
    active_device_id: takesOver ? deviceId : current.active_device_id,
    origin_device_id: deviceId,
    updated_at_ms: Date.now(),
    version: current.version + 1,
  };

  cancelFreeze(userId);
  const trackChanged = next.track?.track_id !== current.track?.track_id;
  record({
    type: trackChanged ? "track" : next.playing ? "play" : "pause",
    user_id: userId,
    device_id: deviceId,
    track_id: next.track?.track_id ?? null,
    position_ms: next.position_ms,
    version: next.version,
  });
  return commit(next);
};

/**
 * The active device's heartbeat: position and play/pause, every few seconds.
 *
 * Only the active device is heard — a passive device that is still ticking (it
 * has not processed the transfer yet) must not drag the position backwards.
 * Progress does not bump the version: it refreshes the same revision, so a
 * device that is mid-transfer does not see a version race.
 */
export const applyProgress = (
  userId: string,
  deviceId: string,
  progress: {position_ms: number; playing: boolean; track_id?: string},
): PlaybackState | null => {
  const current = states.get(userId);
  if (!current || current.active_device_id !== deviceId) return null;
  if (progress.track_id && current.track && progress.track_id !== current.track.track_id) return null;

  const next: PlaybackState = {
    ...current,
    position_ms: Math.max(0, progress.position_ms),
    playing: progress.playing,
    updated_at_ms: Date.now(),
    origin_device_id: deviceId,
  };
  cancelFreeze(userId);
  states.set(userId, next);
  void publishState(next);
  // Passive devices need the tick too: it is what keeps a remote progress bar
  // honest. The originating device filters its own echo by device id.
  notify(next);
  return next;
};

/**
 * Move the sound to another device.
 *
 * The position is projected to *now* first, so the receiving device seeks to
 * where the track actually is by the time it gets the frame — not to where it
 * was when the last progress tick was sent.
 */
export const transfer = (
  userId: string,
  fromDeviceId: string | null,
  toDeviceId: string,
  play?: boolean,
): PlaybackState => {
  const current = getState(userId);
  const now = Date.now();
  const next: PlaybackState = {
    ...current,
    active_device_id: toDeviceId,
    position_ms: projectPosition(current, now),
    playing: play !== undefined ? play : Boolean(current.track),
    origin_device_id: fromDeviceId,
    updated_at_ms: now,
    version: current.version + 1,
  };
  cancelFreeze(userId);
  record({
    type: "transfer",
    user_id: userId,
    device_id: fromDeviceId,
    target_device_id: toDeviceId,
    track_id: next.track?.track_id ?? null,
    position_ms: next.position_ms,
    version: next.version,
  });
  return commit(next);
};

const cancelFreeze = (userId: string): void => {
  const timer = freezes.get(userId);
  if (timer) {
    clearTimeout(timer);
    freezes.delete(userId);
  }
};

/**
 * The active device's socket died.
 *
 * A network hiccup is not a pause, so nothing happens for `deviceTimeoutMs`. If
 * it stays gone, the position is frozen where it would be by then and the state
 * flips to paused: we no longer know that anything is playing, and another
 * device must be able to pick the track up at the right second.
 */
export const onDeviceGone = (userId: string, deviceId: string): void => {
  const current = states.get(userId);
  if (!current || current.active_device_id !== deviceId || !current.playing) return;
  if (freezes.has(userId)) return;

  const timer = setTimeout(() => {
    freezes.delete(userId);
    const latest = states.get(userId);
    if (!latest || latest.active_device_id !== deviceId || !latest.playing) return;
    const now = Date.now();
    commit({
      ...latest,
      position_ms: projectPosition(latest, now),
      playing: false,
      updated_at_ms: now,
      version: latest.version + 1,
      origin_device_id: deviceId,
    });
    record({
      type: "device_offline",
      user_id: userId,
      device_id: deviceId,
      track_id: latest.track?.track_id ?? null,
      version: latest.version + 1,
    });
  }, cfg.deviceTimeoutMs);
  timer.unref?.();
  freezes.set(userId, timer);
};

/**
 * Called once the Kafka replay is done.
 *
 * A restored session can claim to be playing while this process has no sockets
 * at all — the API restarted under it. Arm the same grace period a dropped
 * socket gets: the devices have that long to reconnect and start reporting,
 * otherwise the position is frozen where it belongs.
 */
export const guardRestoredSessions = (): void => {
  for (const state of states.values()) {
    if (state.playing && state.active_device_id) onDeviceGone(state.user_id, state.active_device_id);
  }
};

/** The device came back before the freeze fired. */
export const onDeviceBack = (userId: string, deviceId: string): void => {
  const current = states.get(userId);
  if (current?.active_device_id === deviceId) cancelFreeze(userId);
};

/**
 * Tests only. Subscribers are deliberately NOT dropped: the socket hub
 * subscribes once, at attach time, and a test that reset the sessions would
 * otherwise silently unplug every broadcast.
 */
export const __resetPlayback = (): void => {
  for (const timer of freezes.values()) clearTimeout(timer);
  freezes.clear();
  states.clear();
};

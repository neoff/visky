import {
  __resetPlayback,
  applyProgress,
  applyUpdate,
  getState,
  onDeviceBack,
  onDeviceGone,
  projectPosition,
  transfer,
} from '@/services/playback';
import {PlaybackTrackRef} from '@/types/playback';

const USER = '4242';
const PHONE = 'phone-device';
const TABLET = 'tablet-device';

const TRACK: PlaybackTrackRef = {
  track_id: '-42311167_1',
  owner_id: -42311167,
  id: 1,
  title: 'Artist of the Week Part 1',
  duration: 3600,
};

describe('playback state', () => {
  beforeEach(() => {
    __resetPlayback();
    jest.useRealTimers();
  });
  afterAll(() => jest.useRealTimers());

  it('starts empty', () => {
    const state = getState(USER);
    expect(state.active_device_id).toBeNull();
    expect(state.version).toBe(0);
    expect(state.playing).toBe(false);
  });

  it('makes the reporting device active and bumps the version', () => {
    const state = applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 0});
    expect(state.active_device_id).toBe(PHONE);
    expect(state.track?.track_id).toBe(TRACK.track_id);
    expect(state.version).toBe(1);
  });

  it('extrapolates the position from the moment it was reported', () => {
    const state = applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 10_000});
    expect(projectPosition(state, state.updated_at_ms + 5_000)).toBe(15_000);
    // paused sessions do not drift
    const paused = applyUpdate(USER, PHONE, {playing: false, position_ms: 10_000});
    expect(projectPosition(paused, paused.updated_at_ms + 5_000)).toBe(10_000);
  });

  it('ignores progress from a device that does not own the sound', () => {
    applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 30_000});
    const ignored = applyProgress(USER, TABLET, {position_ms: 0, playing: true});
    expect(ignored).toBeNull();
    expect(getState(USER).position_ms).toBe(30_000);
  });

  it('accepts progress from the active device without bumping the version', () => {
    const started = applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 0});
    const ticked = applyProgress(USER, PHONE, {position_ms: 42_000, playing: true, track_id: TRACK.track_id});
    expect(ticked?.position_ms).toBe(42_000);
    expect(ticked?.version).toBe(started.version);
  });

  it('drops an update carrying a stale version', () => {
    applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 1_000});
    const current = getState(USER);
    const stale = applyUpdate(USER, TABLET, {playing: false, position_ms: 0, version: current.version - 1});
    expect(stale.version).toBe(current.version);
    expect(stale.active_device_id).toBe(PHONE);
    expect(stale.playing).toBe(true);
  });

  it('transfers the sound with the position projected to now', () => {
    const started = applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 60_000});
    // pretend a few seconds of playback happened before the transfer
    const state = getState(USER);
    (state as any).updated_at_ms = state.updated_at_ms - 7_000;

    const moved = transfer(USER, PHONE, TABLET);
    expect(moved.active_device_id).toBe(TABLET);
    expect(moved.playing).toBe(true);
    expect(moved.version).toBe(started.version + 1);
    expect(moved.position_ms).toBeGreaterThanOrEqual(67_000);
    expect(moved.position_ms).toBeLessThan(68_000);
    expect(moved.track?.track_id).toBe(TRACK.track_id);
  });

  it('transfers a paused session without starting it', () => {
    applyUpdate(USER, PHONE, {track: TRACK, playing: false, position_ms: 5_000});
    const moved = transfer(USER, PHONE, TABLET, false);
    expect(moved.playing).toBe(false);
    expect(moved.position_ms).toBe(5_000);
  });

  it('freezes the position when the active device stays gone', () => {
    jest.useFakeTimers();
    applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 0});
    onDeviceGone(USER, PHONE);

    jest.advanceTimersByTime(20_000);
    expect(getState(USER).playing).toBe(true); // a hiccup is not a pause

    jest.advanceTimersByTime(40_000);
    const frozen = getState(USER);
    expect(frozen.playing).toBe(false);
    // frozen where the track was when the grace period expired (45s in)
    expect(frozen.position_ms).toBe(45_000);
  });

  it('keeps playing when the device comes back before the freeze', () => {
    jest.useFakeTimers();
    applyUpdate(USER, PHONE, {track: TRACK, playing: true, position_ms: 0});
    onDeviceGone(USER, PHONE);
    jest.advanceTimersByTime(10_000);
    onDeviceBack(USER, PHONE);
    jest.advanceTimersByTime(120_000);
    expect(getState(USER).playing).toBe(true);
  });
});

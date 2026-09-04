// Imported by path, not by package name: the jest config maps the package to
// this very file, so it is the same module either way — and TypeScript can only
// see the fake's test helpers through the path.
import TrackPlayer, {__load, __player, __reset} from '../__mocks__/trackPlayer'
import {
  __resetReconciler,
  isApplyingRemote,
  reconcile,
  restoreCached,
  runLocalAction,
  sessionPositionFor,
} from '@/services/playbackReconciler'
import {SONGS_CACHE_KEY, rememberWindow} from '@/store/library'
import {usePlaybackStore} from '@/store/playback'
import {PlaybackState} from '@/types/playback'

jest.mock('@/helpers/network', () => ({
  fetchTrackById: jest.fn(),
  fetchFriskyPage: jest.fn(),
  fetchFavoritesPage: jest.fn(),
}))

const {fetchTrackById, fetchFriskyPage, fetchFavoritesPage} = jest.requireMock('@/helpers/network')

const THIS_DEVICE = 'desktop-1'
const OTHER_DEVICE = 'iphone-1'

const track = (id: number) => ({
  id,
  owner_id: -42311167,
  title: `Show ${id}`,
  url: `https://cdn.vk.com/${id}/index.m3u8`,
})

const key = (id: number) => `-42311167_${id}`

const sessionState = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  user_id: 'u1',
  active_device_id: OTHER_DEVICE,
  track: {track_id: key(2), owner_id: -42311167, id: 2, duration: 3600},
  context: {kind: 'frisky'},
  position_ms: 60_000,
  playing: true,
  updated_at_ms: Date.now(),
  version: 1,
  origin_device_id: OTHER_DEVICE,
  ...over,
})

beforeEach(() => {
  // The reconciler keeps a 1.2s window open after every change it applies, and
  // one of the tests below is about that window not opening. Fake timers make
  // it observable instead of a race.
  jest.useFakeTimers()
  __reset()
  __resetReconciler()
  rememberWindow(SONGS_CACHE_KEY, [])
  usePlaybackStore.setState({deviceId: THIS_DEVICE, state: null, clockOffsetMs: 0})
  fetchTrackById.mockReset()
  fetchFriskyPage.mockReset()
  fetchFavoritesPage.mockReset()
  fetchTrackById.mockImplementation(async (_owner: unknown, id: number) => track(Number(id)))
  fetchFriskyPage.mockResolvedValue([])
  fetchFavoritesPage.mockResolvedValue([])
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

/**
 * "Трек закончился, а следующий не стартовал."
 *
 * The reconciler resolves a track the local queue does not hold — the normal
 * shape of a cold start, which restores the last track into an empty player —
 * and it used to do it with `reset()` + `add([track])`. A queue of one is a
 * dead end: when it finishes there is nothing to move to and the show simply
 * stops, an hour after the only visible action.
 */
describe('the queue a restored track lands in', () => {
  it('is the list around the track, not the track alone', async () => {
    rememberWindow(SONGS_CACHE_KEY, [track(1), track(2), track(3), track(4)] as never)

    await restoreCached(sessionState())

    expect(__player.queue.length).toBeGreaterThan(1)
    expect(__player.queue.map((item: Record<string, unknown>) => `${item.owner_id}_${item.id}`)).toEqual([
      key(2),
      key(3),
      key(4),
      key(1),
    ])
  })

  it('puts the freshly resolved track first, so its signed link is the new one', async () => {
    rememberWindow(SONGS_CACHE_KEY, [track(1), track(2)] as never)
    fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})

    await restoreCached(sessionState())

    expect(__player.queue[0].url).toBe('https://cdn.vk.com/2/fresh.m3u8')
  })

  it('asks the API for a page when no screen has loaded one yet', async () => {
    // The cold start reaches the reconciler BEFORE any tab has mounted, so the
    // window it would normally read is empty — and MMKV, which is where that
    // window is mirrored, does not exist at all on the web and desktop builds.
    fetchFriskyPage.mockResolvedValue([track(2), track(5)])

    await restoreCached(sessionState())

    expect(fetchFriskyPage).toHaveBeenCalledTimes(1)
    expect(__player.queue.map((item: Record<string, unknown>) => item.id)).toEqual([2, 5])
  })

  it('reads the favourites list when that is where the track came from', async () => {
    fetchFavoritesPage.mockResolvedValue([track(2), track(7)])

    await restoreCached(sessionState({context: {kind: 'favorites'}}))

    expect(fetchFavoritesPage).toHaveBeenCalledTimes(1)
    expect(fetchFriskyPage).not.toHaveBeenCalled()
  })

  it('still loads the track when there is no list to be had', async () => {
    fetchFriskyPage.mockRejectedValue(new Error('offline'))

    await restoreCached(sessionState())

    expect(__player.queue.map((item: Record<string, unknown>) => item.id)).toEqual([2])
  })

  it('skips inside the queue it already holds instead of rebuilding it', async () => {
    __load([track(1), track(2), track(3)], 0, true)

    await reconcile(sessionState())

    expect(TrackPlayer.reset).not.toHaveBeenCalled()
    expect(fetchTrackById).not.toHaveBeenCalled()
    expect(__player.index).toBe(1)
  })
})

/**
 * "При выборе другой композиции на другом устройстве композиция стопается (это
 * хорошо), но выбранная композиция не подсвечивается."
 *
 * Following the session's track used to sit behind a cold-start guard, so a
 * passive device stopped following after the very first frame: the sound
 * stopped, which looked right, and the screen kept showing the PREVIOUS track
 * for ever, because the highlight reads the local player and the local player
 * had never been told.
 */
describe('a device that does not own the sound', () => {
  it('follows the session onto a new track, not only on the first frame', async () => {
    __load([track(1), track(2)], 0, true)

    await reconcile(sessionState({version: 1, track: {track_id: key(1), owner_id: -42311167, id: 1}}))
    await reconcile(sessionState({version: 2, track: {track_id: key(2), owner_id: -42311167, id: 2}}))

    expect(__player.queue[__player.index!].id).toBe(2)
  })

  it('goes quiet when the other device takes the sound', async () => {
    __load([track(2)], 0, true)

    await reconcile(sessionState())

    expect(TrackPlayer.pause).toHaveBeenCalled()
    expect(__player.playWhenReady).toBe(false)
  })

  /**
   * "В свернутом миниплеере плей перехватывается хорошо, в развернутом — не
   * перехватывает другое устройство."
   *
   * Not about which player is on screen — about WHEN the button is pressed. The
   * other device sends progress every few seconds, and each frame used to go
   * through the "applying" window, which makes this device ignore its own
   * player for 1.2s so a transfer is not echoed back. A quarter of the time,
   * pressing play did nothing at all.
   */
  it('does not go deaf to its own player over a frame with nothing to apply', async () => {
    __load([track(2)], 0, true)

    // the first frame has something to apply: this device is still making
    // sound, and stopping it is a change
    await reconcile(sessionState({version: 1}))
    jest.advanceTimersByTime(1_500)
    expect(isApplyingRemote()).toBe(false)

    // every frame after it is just the other device's progress. Silent and
    // already on the session's track is nothing to apply, and applying nothing
    // used to cost this device 1.2s of not hearing its own play button.
    await reconcile(sessionState({version: 2, position_ms: 65_000}))
    expect(isApplyingRemote()).toBe(false)

    await reconcile(sessionState({version: 3, position_ms: 70_000}))
    expect(isApplyingRemote()).toBe(false)
  })

  it('does not re-seek a paused player on every progress frame', async () => {
    __load([track(2)], 0, false)

    await reconcile(sessionState({version: 1}))
    const seeks = TrackPlayer.seekTo.mock.calls.length
    await reconcile(sessionState({version: 2, position_ms: 120_000}))

    expect(TrackPlayer.seekTo.mock.calls.length).toBe(seeks)
  })
})

/**
 * "Перехват происходит с того момента, на котором остановился плей, а не с того
 * момента, что был на другом устройстве."
 *
 * Desktop left at 16:41, the phone plays on to 19:25, press play on the desktop
 * — and the whole account rewinds to 16:41.
 */
describe('sessionPositionFor', () => {
  it('projects the session forward while the other device plays', () => {
    usePlaybackStore.setState({
      state: sessionState({position_ms: 1_001_000, updated_at_ms: Date.now() - 30_000}),
    })

    const position = sessionPositionFor(key(2))!

    expect(position).toBe(1_031_000)
  })

  it('holds still while the session is paused', () => {
    usePlaybackStore.setState({
      state: sessionState({playing: false, position_ms: 1_001_000, updated_at_ms: Date.now() - 30_000}),
    })

    expect(sessionPositionFor(key(2))).toBe(1_001_000)
  })

  it('answers null for a different track, so the local position is used', () => {
    usePlaybackStore.setState({state: sessionState()})

    expect(sessionPositionFor(key(9))).toBeNull()
    expect(sessionPositionFor(undefined)).toBeNull()
  })
})

/**
 * "Сейчас в десктоп версии выбираю один трек — играет другой."
 *
 * The tap and the reconciler write to the same player. The frames already in
 * flight when the tap happened were written before it and still name the other
 * device; applying one pauses the track the user just started.
 */
describe('a track the user just picked', () => {
  it('survives a frame that was already in flight', async () => {
    __load([track(5)], 0, true)

    await runLocalAction(async () => {
      __load([track(5)], 0, true)
    })
    await reconcile(sessionState({version: 4, track: {track_id: key(2), owner_id: -42311167, id: 2}}))

    expect(TrackPlayer.pause).not.toHaveBeenCalled()
    expect(__player.queue[__player.index!].id).toBe(5)
  })

  it('lets the session drive again once our own update comes back', async () => {
    __load([track(5)], 0, true)
    await runLocalAction(async () => undefined)

    // the echo of our own takeover: the claim is spent here
    await reconcile(sessionState({version: 4, active_device_id: THIS_DEVICE, origin_device_id: THIS_DEVICE}))
    // and the next frame from the other device is applied normally
    await reconcile(sessionState({version: 5}))

    expect(TrackPlayer.pause).toHaveBeenCalled()
  })
})

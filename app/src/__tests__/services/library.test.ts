import {FAVORITES_CACHE_KEY, SONGS_CACHE_KEY, cachedTracks, rememberWindow} from '@/store/library'

/**
 * MMKV is a native module: on the web and desktop builds there is no
 * `NativeModules.MMKVStorage` to bind to and every read throws. That did not
 * matter while the only readers were the car and the watch — neither runs
 * there — but the playback reconciler is a third reader that does, and a device
 * that cannot read the list rebuilds a queue of ONE track.
 *
 * The mock in this suite throws exactly the way the real loader does off a
 * device.
 */
describe('the cached window', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    rememberWindow(SONGS_CACHE_KEY, [])
    rememberWindow(FAVORITES_CACHE_KEY, [])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('comes back from memory when the native store is not there', async () => {
    rememberWindow(SONGS_CACHE_KEY, [{id: 1}, {id: 2}] as never)

    await expect(cachedTracks(SONGS_CACHE_KEY)).resolves.toHaveLength(2)
  })

  it('never throws, whatever the storage does', async () => {
    await expect(cachedTracks('a-key-nobody-wrote')).resolves.toEqual([])
  })

  it('keeps the two lists apart', async () => {
    rememberWindow(SONGS_CACHE_KEY, [{id: 1}] as never)
    rememberWindow(FAVORITES_CACHE_KEY, [{id: 9}, {id: 8}] as never)

    await expect(cachedTracks(FAVORITES_CACHE_KEY)).resolves.toHaveLength(2)
    await expect(cachedTracks(SONGS_CACHE_KEY)).resolves.toHaveLength(1)
  })
})

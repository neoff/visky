import {PlaylistPlayer} from 'react-native-track-player/lib/web/TrackPlayer/PlaylistPlayer'
import {State} from 'react-native-track-player/lib/src/constants/State'

/**
 * The web player, as patched (app/patches/react-native-track-player+4.1.2.patch).
 *
 * This is the implementation the desktop shell runs — the Expo bundle exported
 * for platform `web`, in a WKWebView — and two of its behaviours are why a
 * track could end with nothing following it.
 */

type Loadable = {url: string}

class Harness extends PlaylistPlayer {
  loads: unknown[] = []
  rejectFor = new Set<string>()
  preloadManagers: {url: string; destroyed: boolean}[] = []

  constructor(tracks: Loadable[], index?: number) {
    super()
    const self = this as any
    self.playlist = tracks
    self._currentIndex = index
    self.element = {
      currentTime: 0,
      play: async () => undefined,
      pause: () => undefined,
    }
    self.player = {
      load: async (target: unknown) => {
        this.loads.push(target)
        if (typeof target === 'string' && this.rejectFor.has(target)) {
          throw new Error(`403 for ${target}`)
        }
      },
      preload: async (url: string) => {
        const manager = {url, destroyed: false, destroy: async () => {
          manager.destroyed = true
        }}
        this.preloadManagers.push(manager as never)
        return manager
      },
      unload: async () => undefined,
    }
  }

  get index(): number | undefined {
    return (this as any)._currentIndex
  }

  end(): Promise<void> {
    return (this as any).onStateUpdate(State.Ended)
  }
}

const track = (id: number) => ({url: `https://cdn.vk.com/${id}/index.m3u8`, id})

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

/**
 * "Трек закончился, а следующий не стартовал."
 *
 * A VK link signed an hour ago fails at exactly the moment the player needs
 * it — the end of a long show — and the failure used to be invisible.
 */
describe('a next track that will not load', () => {
  it('does not throw out of the media event that started it', async () => {
    const player = new Harness([track(1), track(2)], 0)
    player.rejectFor.add(track(2).url)

    // `ended` is a DOM event handler: nothing awaits what it returns, so a
    // rejection here was an unhandled one and the only trace of the failure.
    await expect(player.end()).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })

  it('leaves the active index on the track that is actually loaded', async () => {
    const player = new Harness([track(1), track(2)], 0)
    player.rejectFor.add(track(2).url)

    await player.end()

    // The index is claimed BEFORE the load. Unwound, the player reported an
    // active index whose track it had never loaded, and everything that asks
    // it where it is got a different answer from everything that asks it what
    // is playing.
    expect(player.index).toBe(0)
  })

  it('still reports the end of the playlist as the end of the playlist', async () => {
    const player = new Harness([track(1)], 0)
    const ended = jest.fn()
    ;(player as any).onPlaylistEnded = ended

    await player.end()

    expect(ended).toHaveBeenCalled()
  })
})

/**
 * The gap itself. shaka can park a parsed manifest and the head of the stream
 * in a PreloadManager, and `load` can adopt it — a swap instead of a fetch.
 */
describe('a parked preload', () => {
  it('is adopted when the hand-over reaches that track', async () => {
    const player = new Harness([track(1), track(2)], 0)

    await (player as any).preload(track(2).url)
    await player.end()

    // the manager, not the url: nothing is fetched at the hand-over
    expect(typeof player.loads[0]).toBe('object')
    expect((player.loads[0] as {url: string}).url).toBe(track(2).url)
  })

  it('is destroyed rather than kept when the queue goes somewhere else', async () => {
    const player = new Harness([track(1), track(2), track(3)], 0)

    await (player as any).preload(track(3).url)
    await player.end()

    expect(player.loads[0]).toBe(track(2).url)
    expect(player.preloadManagers[0].destroyed).toBe(true)
  })

  it('is only prepared once for the same url', async () => {
    const player = new Harness([track(1), track(2)], 0)

    await (player as any).preload(track(2).url)
    await (player as any).preload(track(2).url)

    expect(player.preloadManagers).toHaveLength(1)
  })

  it('is released when the player stops, because it holds buffers', async () => {
    const player = new Harness([track(1), track(2)], 0)

    await (player as any).preload(track(2).url)
    await player.stop()

    expect(player.preloadManagers[0].destroyed).toBe(true)
  })

  it('falls back to an ordinary load if adopting it fails', async () => {
    const player = new Harness([track(1), track(2)], 0)
    await (player as any).preload(track(2).url)
    const manager = player.preloadManagers[0]
    ;(player as any).player.load = async (target: unknown) => {
      player.loads.push(target)
      if (target === manager) throw new Error('preload manager expired')
    }

    await player.end()

    expect(player.loads).toEqual([manager, track(2).url])
    expect(player.index).toBe(1)
  })
})

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

  it('tells the app about it, so the link can be re-signed', async () => {
    const player = new Harness([track(1), track(2)], 0)
    player.rejectFor.add(track(2).url)
    const reported = jest.fn()
    ;(player as any).onNextTrackFailed = reported

    await player.end()

    // Silence here is what left the show stopped between two halves of one
    // set: the app can fetch a fresh url, but only if it is told to.
    expect(reported).toHaveBeenCalled()
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

/**
 * "Кликаю на Firmament Part 1, а продолжает играть Seventeen Part 2."
 *
 * Starting a track from a list the player is not already holding is
 * reset -> add -> play. Upstream's `reset()` empties the playlist and leaves
 * the active index where it was, and `add()` loads the first track only when
 * that index is undefined — so nothing was ever loaded, `play()` carried on
 * with the track still in the element, and the stale index pointed into a
 * queue it had never belonged to.
 */
describe('resetting the queue', () => {
  it('forgets which track was active, so the next add loads one', async () => {
    const player = new Harness([track(1), track(2), track(3)], 2)

    await player.reset()

    expect(player.index).toBeUndefined()

    await player.add([track(7), track(8)])

    expect(player.index).toBe(0)
    expect(player.loads).toEqual([track(7).url])
  })

  it('does not resume the old track when a new list is started', async () => {
    const player = new Harness([track(1), track(2)], 1)
    player.loads.length = 0

    // what a tap on a row does for a list the player is not holding
    await player.reset()
    await player.add([track(5), track(6)])

    // the track that was playing before is not among the loads, and the one
    // the user asked for is
    expect(player.loads).toEqual([track(5).url])
  })
})

/**
 * "Проиграло и замолчало, даже не пытается восстановиться."
 *
 * A stream dies — VK's CDN answered 503 for a segment, which reaches shaka as
 * error 1001 — and upstream recorded it as a state and a console line. The app
 * listens for PlaybackError to re-sign the url and pick the track back up
 * (services/recovery); nothing emitted it, so the desktop went quiet for good.
 */
describe('a stream that fails mid-track', () => {
  it('is reported to the app, not only to the console', async () => {
    const player = new Harness([track(1)], 0)
    const seen: unknown[] = []
    ;(player as any).onFatalError = (error: unknown) => seen.push(error)

    ;(player as any).onError({code: 1001, message: 'HTTP error'})

    expect(seen).toHaveLength(1)
    expect((seen[0] as {code: number}).code).toBe(1001)
  })
})

import TrackPlayer, {__load, __player, __reset} from '../__mocks__/trackPlayer'
import {__resetPrefetch, prefetchNextTrack} from '@/services/prefetch'

jest.mock('@/helpers/network', () => ({fetchTrackById: jest.fn()}))
const {fetchTrackById} = jest.requireMock('@/helpers/network')

const track = (id: number, url = `https://cdn.vk.com/${id}/index.m3u8`) => ({
  id,
  owner_id: -42311167,
  title: `Show ${id}`,
  url,
})

const manifest = ['#EXTM3U', '#EXTINF:10,', 'seg1.ts', '#EXTINF:10,', 'seg2.ts'].join('\n')

const respond = (status: number, body = manifest) =>
  ({ok: status >= 200 && status < 300, status, text: async () => body}) as unknown as Response

let fetchMock: jest.Mock

beforeEach(() => {
  __reset()
  __resetPrefetch()
  fetchTrackById.mockReset()
  fetchMock = jest.fn(async () => respond(200))
  ;(globalThis as {fetch?: unknown}).fetch = fetchMock
  delete (globalThis as {rntpPlayer?: unknown}).rntpPlayer
})

/**
 * The hand-over the listener notices most is Part 1 -> Part 2 of one show: it
 * is the middle of a set. VK signs its links, so by the time an hour of Part 1
 * has played the link sitting in the queue for Part 2 is an hour old, and the
 * player only finds that out at the moment it needs it.
 */
describe('warming the next track', () => {
  it('waits until the current track is nearly over', async () => {
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(100, 3_600)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing at the end of the queue', async () => {
    __load([track(1)], 0)

    await prefetchNextTrack(3_590, 3_600)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('warms a track once, not on every progress tick', async () => {
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)
    await prefetchNextTrack(3_560, 3_600)
    await prefetchNextTrack(3_570, 3_600)

    const manifests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('index.m3u8'))
    expect(manifests).toHaveLength(1)
  })

  it('pulls the head of the first segments, not whole files', async () => {
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    const ranged = fetchMock.mock.calls.filter(([, init]) => init?.headers?.Range)
    expect(ranged).toHaveLength(2)
    expect(ranged[0][1].headers.Range).toBe('bytes=0-131071')
  })
})

/**
 * A signed link that aged out is the case worth a round trip. The swap has to
 * ADD before it REMOVES: a queue that momentarily ends after the active track
 * is enough for the player to decide the show is over.
 */
describe('a stale link on the next track', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/2/') ? respond(403, '') : respond(200),
    )
    fetchTrackById.mockResolvedValue(track(2, 'https://cdn.vk.com/2/fresh.m3u8'))
  })

  it('re-resolves it and swaps it into the queue', async () => {
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    expect(fetchTrackById).toHaveBeenCalledWith(-42311167, 2)
    expect(__player.queue).toHaveLength(2)
    expect(__player.queue[1].url).toBe('https://cdn.vk.com/2/fresh.m3u8')
  })

  it('adds before it removes, so the queue never ends after the active track', async () => {
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    const addAt = TrackPlayer.add.mock.invocationCallOrder[0]
    const removeAt = TrackPlayer.remove.mock.invocationCallOrder[0]
    expect(addAt).toBeLessThan(removeAt)
  })

  it('never touches the track that is playing', async () => {
    // one track, and it is the active one: there is no "next" to refresh, and
    // refreshing the active entry would reload what the listener is hearing
    __load([track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    expect(fetchTrackById).not.toHaveBeenCalled()
    expect(TrackPlayer.add).not.toHaveBeenCalled()
  })

  it('leaves the queue alone when the API cannot resolve the track either', async () => {
    __load([track(1), track(2)], 0)
    fetchTrackById.mockResolvedValue({...track(2), url: undefined})

    await prefetchNextTrack(3_550, 3_600)

    expect(__player.queue).toHaveLength(2)
    expect(TrackPlayer.remove).not.toHaveBeenCalled()
  })
})

/**
 * The gap itself. Where the player can park a manifest ahead of time, the
 * hand-over becomes a swap rather than a fetch — so the next track's url is
 * handed to it as soon as the url is known to be good.
 */
describe('handing the next manifest to the player', () => {
  it('parks the url that will actually be played', async () => {
    const preload = jest.fn(async () => undefined)
    ;(globalThis as {rntpPlayer?: unknown}).rntpPlayer = {preload}
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    expect(preload).toHaveBeenCalledWith('https://cdn.vk.com/2/index.m3u8')
  })

  it('parks the FRESH url after a stale one was replaced', async () => {
    const preload = jest.fn(async () => undefined)
    ;(globalThis as {rntpPlayer?: unknown}).rntpPlayer = {preload}
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/2/index') ? respond(403, '') : respond(200),
    )
    fetchTrackById.mockResolvedValue(track(2, 'https://cdn.vk.com/2/fresh.m3u8'))
    __load([track(1), track(2)], 0)

    await prefetchNextTrack(3_550, 3_600)

    expect(preload).toHaveBeenCalledWith('https://cdn.vk.com/2/fresh.m3u8')
  })

  it('survives a shell that cannot preload at all', async () => {
    // WKWebView plays HLS itself, so shaka never touches the bytes and its
    // preload answers null. The warm-up must still run.
    ;(globalThis as {rntpPlayer?: unknown}).rntpPlayer = {}
    __load([track(1), track(2)], 0)

    await expect(prefetchNextTrack(3_550, 3_600)).resolves.toBeUndefined()
  })
})

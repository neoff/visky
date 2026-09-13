import TrackPlayer, {__load, __player, __reset} from '../__mocks__/trackPlayer'
import {__resetRecovery, recoverFromPlaybackError} from '@/services/recovery'

jest.mock('@/helpers/network', () => ({fetchTrackById: jest.fn()}))
const {fetchTrackById} = jest.requireMock('@/helpers/network')

const track = (id: number, url = `https://cdn.vk.com/${id}/old.m3u8`) => ({
  id,
  owner_id: -42311167,
  title: `Show ${id}`,
  url,
})

beforeEach(() => {
  __reset()
  __resetRecovery()
  fetchTrackById.mockReset()
})

/**
 * The show used to stop dead between two halves of one set: the link for Part 2
 * was signed an hour earlier, the player refused it, and nothing said so.
 */
describe('picking playback back up after a track would not load', () => {
  it('re-signs the next track and starts it', async () => {
    __load([track(1), track(2)], 0, true)
    fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})

    const recovered = await recoverFromPlaybackError('next')

    expect(recovered).toBe(true)
    expect(__player.index).toBe(1)
    expect(__player.queue).toHaveLength(2)
    expect(__player.queue[1].url).toBe('https://cdn.vk.com/2/fresh.m3u8')
    expect(TrackPlayer.play).toHaveBeenCalled()
  })

  it('keeps the position when it is the PLAYING track that broke', async () => {
    __load([track(1)], 0, true)
    __player.position = 1_200 // twenty minutes in
    fetchTrackById.mockResolvedValue({...track(1), url: 'https://cdn.vk.com/1/fresh.m3u8'})

    const recovered = await recoverFromPlaybackError('current')

    expect(recovered).toBe(true)
    // `load` replaces the track in place; the queue keeps its shape
    expect(__player.queue).toHaveLength(1)
    expect(__player.queue[0].url).toBe('https://cdn.vk.com/1/fresh.m3u8')
    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(1_200)
  })

  it('does not seek when the track had barely started', async () => {
    __load([track(1)], 0, true)
    __player.position = 1
    fetchTrackById.mockResolvedValue({...track(1), url: 'https://cdn.vk.com/1/fresh.m3u8'})

    await recoverFromPlaybackError('current')

    expect(TrackPlayer.seekTo).not.toHaveBeenCalled()
  })

  it('gives up on a track that keeps failing instead of looping on it', async () => {
    __load([track(1), track(2)], 0, true)
    fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})

    await recoverFromPlaybackError('next')
    __load([track(1), track(2)], 0, true)
    await recoverFromPlaybackError('next')
    fetchTrackById.mockClear()
    __load([track(1), track(2)], 0, true)

    const third = await recoverFromPlaybackError('next')

    expect(third).toBe(false)
    expect(fetchTrackById).not.toHaveBeenCalled()
  })

  it('leaves the queue alone when the API cannot re-sign the track', async () => {
    __load([track(1), track(2)], 0, true)
    fetchTrackById.mockResolvedValue({...track(2), url: ''})

    const recovered = await recoverFromPlaybackError('next')

    expect(recovered).toBe(false)
    expect(__player.index).toBe(0)
    expect(__player.queue[1].url).toBe('https://cdn.vk.com/2/old.m3u8')
  })

  it('does nothing at the end of the queue', async () => {
    __load([track(1)], 0, true)

    const recovered = await recoverFromPlaybackError('next')

    expect(recovered).toBe(false)
    expect(fetchTrackById).not.toHaveBeenCalled()
  })
})

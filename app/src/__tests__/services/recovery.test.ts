import TrackPlayer, {__load, __player, __reset} from '../__mocks__/trackPlayer'
import {
  __resetRecovery,
  noteActiveTrackChanged,
  notePosition,
  recoverFromPlaybackError,
} from '@/services/recovery'

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
    fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})

    // A signed link outlives neither a long show nor a bad network, so four
    // tries are allowed — spaced, or they would all be spent on one report.
    const now = jest.spyOn(Date, 'now')
    let clock = 1_000_000
    now.mockImplementation(() => clock)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      __load([track(1), track(2)], 0, true)
      expect(await recoverFromPlaybackError('next')).toBe(true)
      clock += 5_000
    }

    fetchTrackById.mockClear()
    __load([track(1), track(2)], 0, true)

    // the fifth report does not re-sign it; the show moves past it instead
    const fifth = await recoverFromPlaybackError('next')

    expect(fifth).toBe(true)
    expect(fetchTrackById).not.toHaveBeenCalled()
    expect(__player.index).toBe(1)
    now.mockRestore()
  })

  it('treats the same failure reported twice as one attempt', async () => {
    fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})
    const now = jest.spyOn(Date, 'now')
    now.mockImplementation(() => 2_000_000) // the same instant for both reports

    __load([track(1), track(2)], 0, true)
    expect(await recoverFromPlaybackError('next')).toBe(true)

    fetchTrackById.mockClear()
    __load([track(1), track(2)], 0, true)
    // the players report a dead segment more than once; the second report must
    // not cost an attempt, and must not fire a second re-sign either
    expect(await recoverFromPlaybackError('next')).toBe(false)
    expect(fetchTrackById).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it('leaves the queue alone when the API cannot re-sign the track', async () => {
    __load([track(1), track(2)], 0, true)
    fetchTrackById.mockResolvedValue({...track(2), url: ''})

    await recoverFromPlaybackError('next')

    // the entry is not rewritten; moving on is a separate decision, below
    expect(__player.queue[1].url).toBe('https://cdn.vk.com/2/old.m3u8')
  })

  /**
   * VK's own player does this: a track that will not start is left behind and
   * the next one begins. Ours used to stop dead — the silence a listener
   * reports as "I tap and nothing plays".
   */
  describe('a track that cannot be played at all', () => {
    it('is left behind for the next one', async () => {
      __load([track(1), track(2)], 0, true)
      fetchTrackById.mockResolvedValue({...track(1), url: ''})

      const recovered = await recoverFromPlaybackError('current')

      expect(recovered).toBe(true)
      expect(__player.index).toBe(1)
      expect(TrackPlayer.play).toHaveBeenCalled()
    })

    it('stops rather than walking a queue where everything is dead', async () => {
      fetchTrackById.mockResolvedValue({url: ''})
      const now = jest.spyOn(Date, 'now')
      let clock = 5_000_000
      now.mockImplementation(() => clock)

      for (let i = 0; i < 3; i += 1) {
        __load([track(1), track(2), track(3), track(4), track(5)], i, true)
        expect(await recoverFromPlaybackError('current')).toBe(true)
        clock += 1_000
      }

      __load([track(1), track(2), track(3), track(4), track(5)], 3, true)
      expect(await recoverFromPlaybackError('current')).toBe(false)
      now.mockRestore()
    })

    it('says so at the end of the queue instead of pretending', async () => {
      __load([track(1)], 0, true)
      fetchTrackById.mockResolvedValue({...track(1), url: ''})

      expect(await recoverFromPlaybackError('current')).toBe(false)
    })
  })

  /**
   * Issue #5: a stream that dies mid-track makes the native player advance by
   * itself, and the error arrives afterwards. Reading the player's own state at
   * that point names the track that took over, so the show the listener was
   * actually on was dropped and never resumed.
   */
  describe('when the player has already skipped past the track that broke', () => {
    it('goes back to it and resumes where it was cut off', async () => {
      __load([track(1), track(2)], 0, true)
      notePosition(900, 3_600) // fifteen minutes into an hour-long show
      // the player moved on by itself: track 1 left, unfinished, at 900s
      noteActiveTrackChanged({lastTrack: {...track(1), duration: 3_600}, lastPosition: 900})
      __load([track(1), track(2)], 1, true)
      fetchTrackById.mockResolvedValue({...track(1), url: 'https://cdn.vk.com/1/fresh.m3u8'})

      const recovered = await recoverFromPlaybackError('current')

      expect(recovered).toBe(true)
      expect(__player.index).toBe(0)
      expect(__player.queue).toHaveLength(2)
      expect(__player.queue[0].url).toBe('https://cdn.vk.com/1/fresh.m3u8')
      expect(TrackPlayer.seekTo).toHaveBeenCalledWith(900)
      expect(TrackPlayer.play).toHaveBeenCalled()
    })

    it('leaves a track that actually ran out alone', async () => {
      __load([track(1), track(2)], 0, true)
      notePosition(3_595, 3_600)
      // a normal hand-over: track 1 finished
      noteActiveTrackChanged({lastTrack: {...track(1), duration: 3_600}, lastPosition: 3_595})
      __load([track(1), track(2)], 1, true)
      fetchTrackById.mockResolvedValue({...track(2), url: 'https://cdn.vk.com/2/fresh.m3u8'})

      const recovered = await recoverFromPlaybackError('current')

      // the ACTIVE track is the one to fix, in place — nobody is dragged back
      expect(recovered).toBe(true)
      expect(__player.index).toBe(1)
      expect(__player.queue[1].url).toBe('https://cdn.vk.com/2/fresh.m3u8')
    })

    it('resumes from the last tick when the player reports no position', async () => {
      __load([track(1)], 0, true)
      __player.position = 0 // what a player that has just errored can report
      notePosition(1_500, 3_600)
      fetchTrackById.mockResolvedValue({...track(1), url: 'https://cdn.vk.com/1/fresh.m3u8'})

      await recoverFromPlaybackError('current')

      expect(TrackPlayer.seekTo).toHaveBeenCalledWith(1_500)
    })
  })

  it('does nothing at the end of the queue', async () => {
    __load([track(1)], 0, true)

    const recovered = await recoverFromPlaybackError('next')

    expect(recovered).toBe(false)
    expect(fetchTrackById).not.toHaveBeenCalled()
  })
})

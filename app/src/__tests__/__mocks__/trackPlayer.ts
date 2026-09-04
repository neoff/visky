/**
 * react-native-track-player, as a queue you can look at.
 *
 * Not a bag of `jest.fn()`s: several of the defects these tests pin down are
 * about the STATE the player is left in — a queue with one track in it, an
 * active index pointing at a track that never loaded — so the fake keeps a real
 * queue and a real active index, and the calls are spies on top of it.
 */
export enum TrackType {
  Default = 'default',
  HLS = 'hls',
}

export enum Event {
  PlaybackState = 'playback-state',
  PlaybackError = 'playback-error',
  PlaybackProgressUpdated = 'playback-progress-updated',
  PlaybackActiveTrackChanged = 'playback-active-track-changed',
  PlaybackPlayWhenReadyChanged = 'playback-play-when-ready-changed',
  PlaybackQueueEnded = 'playback-queue-ended',
  RemotePlay = 'remote-play',
  RemotePause = 'remote-pause',
  RemoteNext = 'remote-next',
  RemotePrevious = 'remote-previous',
  RemoteStop = 'remote-stop',
  RemoteDuck = 'remote-duck',
}

export enum State {
  None = 'none',
  Ready = 'ready',
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Buffering = 'buffering',
  Ended = 'ended',
  Error = 'error',
}

export enum RepeatMode {
  Off = 0,
  Track = 1,
  Queue = 2,
}

export enum Capability {
  Play = 'play',
  Pause = 'pause',
  Stop = 'stop',
  SkipToNext = 'skip-to-next',
  SkipToPrevious = 'skip-to-previous',
}

export enum RatingType {
  Heart = 'heart',
}
export enum IOSCategory {
  Playback = 'playback',
}
export enum IOSCategoryMode {
  Default = 'default',
}
export enum AndroidAudioContentType {
  Music = 'music',
}

export type Track = Record<string, any>

const state = {
  queue: [] as Track[],
  index: undefined as number | undefined,
  playWhenReady: false,
  position: 0,
  duration: 0,
  buffered: 0,
  repeatMode: RepeatMode.Off,
  volume: 1,
}

export const __player = state

export const __reset = (): void => {
  state.queue = []
  state.index = undefined
  state.playWhenReady = false
  state.position = 0
  state.duration = 0
  state.buffered = 0
  state.repeatMode = RepeatMode.Off
  state.volume = 1
  Object.values(TrackPlayer).forEach((value: any) => value?.mockClear?.())
}

/** Put the fake in a known playing state without going through the API. */
export const __load = (queue: Track[], index = 0, playing = false): void => {
  state.queue = [...queue]
  state.index = index
  state.playWhenReady = playing
}

const TrackPlayer = {
  setupPlayer: jest.fn(async () => undefined),
  updateOptions: jest.fn(async () => undefined),
  registerPlaybackService: jest.fn(() => undefined),
  addEventListener: jest.fn(() => ({remove: () => undefined})),

  getQueue: jest.fn(async () => [...state.queue]),
  getActiveTrackIndex: jest.fn(async () => state.index),
  getActiveTrack: jest.fn(async () =>
    state.index === undefined ? undefined : state.queue[state.index],
  ),

  add: jest.fn(async (tracks: Track | Track[], insertBeforeIndex?: number) => {
    const items = Array.isArray(tracks) ? tracks : [tracks]
    if (insertBeforeIndex === undefined || insertBeforeIndex === -1) {
      state.queue.push(...items)
    } else {
      state.queue.splice(insertBeforeIndex, 0, ...items)
      if (state.index !== undefined && insertBeforeIndex <= state.index) {
        state.index += items.length
      }
    }
    if (state.index === undefined && state.queue.length) state.index = 0
  }),

  remove: jest.fn(async (indexOrIndexes: number | number[]) => {
    const indexes = Array.isArray(indexOrIndexes) ? indexOrIndexes : [indexOrIndexes]
    state.queue = state.queue.filter((_item, at) => !indexes.includes(at))
  }),

  reset: jest.fn(async () => {
    state.queue = []
    state.index = undefined
    state.playWhenReady = false
    state.position = 0
  }),

  skip: jest.fn(async (index: number) => {
    if (!state.queue[index]) throw new Error('index out of bounds')
    state.index = index
    state.position = 0
  }),
  skipToNext: jest.fn(async () => {
    const next = (state.index ?? 0) + 1
    if (!state.queue[next]) throw new Error('playlist_exhausted')
    state.index = next
    state.position = 0
  }),
  skipToPrevious: jest.fn(async () => {
    const previous = (state.index ?? 0) - 1
    if (!state.queue[previous]) throw new Error('playlist_exhausted')
    state.index = previous
  }),

  play: jest.fn(async () => {
    state.playWhenReady = true
  }),
  pause: jest.fn(async () => {
    state.playWhenReady = false
  }),
  stop: jest.fn(async () => {
    state.playWhenReady = false
  }),

  seekTo: jest.fn(async (seconds: number) => {
    state.position = seconds
  }),
  getProgress: jest.fn(async () => ({
    position: state.position,
    duration: state.duration,
    buffered: state.buffered,
  })),

  getPlayWhenReady: jest.fn(async () => state.playWhenReady),
  setPlayWhenReady: jest.fn(async (value: boolean) => {
    state.playWhenReady = value
  }),

  getVolume: jest.fn(async () => state.volume),
  setVolume: jest.fn(async (value: number) => {
    state.volume = value
  }),

  getRepeatMode: jest.fn(async () => state.repeatMode),
  setRepeatMode: jest.fn(async (mode: RepeatMode) => {
    state.repeatMode = mode
  }),
}

export const useProgress = () => ({
  position: state.position,
  duration: state.duration,
  buffered: state.buffered,
})

export const useTrackPlayerEvents = () => undefined
export const useActiveTrack = () =>
  state.index === undefined ? undefined : state.queue[state.index]

export default TrackPlayer

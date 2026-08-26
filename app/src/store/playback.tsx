import {useMemo} from 'react'
import {create} from 'zustand'
import {MMKVLoader} from 'react-native-mmkv-storage'
import {PlaybackDeviceInfo, PlaybackState} from '@/types/playback'

/**
 * What the server says is playing, on which device, and where in the track.
 *
 * The last snapshot is mirrored to MMKV so a cold start can show the last track
 * before the socket is even up — and can still show it with no network at all.
 */
const storage = new MMKVLoader().withInstanceID('playback').initialize()
const STATE_KEY = 'playback-state'

const readCached = (): PlaybackState | null => {
  try {
    const raw = storage.getString(STATE_KEY)
    return raw ? (JSON.parse(raw) as PlaybackState) : null
  } catch (error) {
    console.warn('Unable to read the cached playback state', error)
    return null
  }
}

interface PlaybackStore {
  /** a live socket to the API */
  connected: boolean
  /** this installation's device id */
  deviceId: string | null
  state: PlaybackState | null
  devices: PlaybackDeviceInfo[]
  /**
   * serverNow - clientNow, measured over the socket.
   *
   * Every position is computed in SERVER time, so a phone whose clock is a
   * minute off still seeks to the right second.
   */
  clockOffsetMs: number
  /**
   * Bumped every time the API says a track gained metadata (a tracklist, a
   * genre, an artist photo) from frisky.fm. It carries no data — the merged
   * track comes from the playlist route like everything else — it is only a
   * signal for the lists on screen to re-read themselves.
   */
  catalogRevision: number
  setConnected: (connected: boolean) => void
  setDeviceId: (deviceId: string | null) => void
  setState: (state: PlaybackState) => void
  setDevices: (devices: PlaybackDeviceInfo[]) => void
  setClockOffset: (offsetMs: number) => void
  bumpCatalog: () => void
}

export const usePlaybackStore = create<PlaybackStore>()((set, get) => ({
  connected: false,
  deviceId: null,
  state: readCached(),
  devices: [],
  clockOffsetMs: 0,
  catalogRevision: 0,

  setConnected: (connected) => set({connected}),
  setDeviceId: (deviceId) => set({deviceId}),

  setState: (state) => {
    // a straggler from a slow frame must not undo a newer one
    const current = get().state
    if (current && state.version < current.version) return
    set({state})
    try {
      storage.setString(STATE_KEY, JSON.stringify(state))
    } catch (error) {
      console.warn('Unable to cache the playback state', error)
    }
  },

  setDevices: (devices) => set({devices}),
  setClockOffset: (clockOffsetMs) => set({clockOffsetMs}),
  bumpCatalog: () => set({catalogRevision: get().catalogRevision + 1}),
}))

/** Server time as this device best understands it. */
export const serverNow = (): number => Date.now() + usePlaybackStore.getState().clockOffsetMs

/** Where the track is at `atServerMs`, from a snapshot. Mirrors the API's maths. */
export const projectPosition = (state: PlaybackState | null, atServerMs: number = serverNow()): number => {
  if (!state) return 0
  if (!state.playing) return state.position_ms
  const projected = Math.max(0, state.position_ms + (atServerMs - state.updated_at_ms))
  const durationMs = state.track?.duration ? state.track.duration * 1000 : null
  return durationMs ? Math.min(projected, durationMs) : projected
}

/** Does the sound belong to THIS device? */
export const useIsActiveDevice = (): boolean =>
  usePlaybackStore((store) => Boolean(store.deviceId) && store.state?.active_device_id === store.deviceId)

/**
 * The device that owns the sound, when it is not this one.
 *
 * Falls back to a nameless stand-in when the roster has not caught up with the
 * state yet — the user still needs to be told the sound moved, even if we
 * cannot say where to yet.
 */
export const useRemoteDevice = (): PlaybackDeviceInfo | null => {
  // Selected as primitives and memoised: a selector that BUILDS the stand-in
  // would hand back a new object on every render, and zustand would re-render
  // for ever ("Maximum update depth exceeded").
  const activeId = usePlaybackStore((store) => store.state?.active_device_id ?? null)
  const thisDevice = usePlaybackStore((store) => store.deviceId)
  const devices = usePlaybackStore((store) => store.devices)

  return useMemo(() => {
    if (!activeId || activeId === thisDevice) return null
    return (
      devices.find((device) => device.device_id === activeId) ?? {
        device_id: activeId,
        name: null,
        platform: null,
        online: true,
        is_active: true,
        last_seen_ms: null,
        can_wake: false,
      }
    )
  }, [activeId, thisDevice, devices])
}

import {create} from 'zustand'
import {MMKVLoader} from 'react-native-mmkv-storage'
import {trackKey} from '@/helpers/miscellaneous'

/**
 * Which tracks have been listened to the end.
 *
 * A show is an hour long and the list is a chronological archive, so "did I
 * already hear this one" is the single most useful thing to see in a row. The
 * set is persisted: it would be worthless if it reset with the app.
 */
const storage = new MMKVLoader().withInstanceID('played').initialize()
const STORAGE_KEY = 'played-tracks'

const readInitial = (): Record<string, boolean> => {
  try {
    const stored = storage.getArray<string>(STORAGE_KEY) as string[] | null
    return Object.fromEntries((stored ?? []).map((key) => [key, true]))
  } catch (error) {
    console.warn('Unable to read the played tracks', error)
    return {}
  }
}

/** newest first, and bounded — this is a hint, not an archive of its own */
const MAX_REMEMBERED = 2000

interface PlayedState {
  played: Record<string, boolean>
  markPlayed: (track: unknown) => void
  reset: () => void
}

export const usePlayedStore = create<PlayedState>()((set, get) => ({
  played: readInitial(),

  markPlayed: (track) => {
    const key = trackKey(track as any)
    if (!key || get().played[key]) return

    const played = {...get().played, [key]: true}
    const keys = Object.keys(played)
    const trimmed = keys.length > MAX_REMEMBERED
      ? Object.fromEntries(keys.slice(keys.length - MAX_REMEMBERED).map((k) => [k, true]))
      : played

    set({played: trimmed})
    try {
      storage.setArray(STORAGE_KEY, Object.keys(trimmed))
    } catch (error) {
      console.warn('Unable to store the played tracks', error)
    }
  },

  reset: () => {
    set({played: {}})
    storage.setArray(STORAGE_KEY, [])
  },
}))

export const useIsPlayed = (track: unknown) =>
  usePlayedStore((state) => {
    const key = trackKey(track as any)
    return key ? Boolean(state.played[key]) : false
  })

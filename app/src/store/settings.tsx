import {create} from 'zustand'
import {MMKVLoader} from 'react-native-mmkv-storage'

/**
 * The switches on the Settings screen.
 *
 * Small, boolean and long-lived: MMKV holds them, exactly as `played` and
 * `playback` hold theirs. Every read is guarded — MMKV is a native module and
 * the web and desktop builds have none, and a missing switch must fall back to
 * the default rather than take the screen down.
 */
const storage = new MMKVLoader().withInstanceID('settings').initialize()

const AUTO_SYNC_KEY = 'auto-sync-favorites'

const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const stored = storage.getBool(key)
    return stored === null || stored === undefined ? fallback : stored
  } catch (error) {
    console.warn('==settings: could not read', key, error)
    return fallback
  }
}

const writeBool = (key: string, value: boolean): void => {
  try {
    storage.setBool(key, value)
  } catch (error) {
    console.warn('==settings: could not write', key, error)
  }
}

interface SettingsState {
  /**
   * Sweep the frisky tracks out of the VK library and into Frisky-favorites
   * whenever the Favorites tab is switched to "All". On by default: a library
   * that predates this app holds years of hearts the Favorites tab cannot see,
   * and the sweep is what makes them appear. Off means the sweep only runs from
   * the button on this screen.
   */
  autoSyncFavorites: boolean
  setAutoSyncFavorites: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  autoSyncFavorites: readBool(AUTO_SYNC_KEY, true),
  setAutoSyncFavorites: (value) => {
    writeBool(AUTO_SYNC_KEY, value)
    set({autoSyncFavorites: value})
  },
}))

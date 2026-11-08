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
const API_VERSION_KEY = 'api-version'

export type ApiVersion = 'v1' | 'v2'

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

const readApiVersion = (fallback: ApiVersion): ApiVersion => {
  try {
    const stored = storage.getString(API_VERSION_KEY)
    return stored === 'v1' || stored === 'v2' ? stored : fallback
  } catch (error) {
    console.warn('==settings: could not read', API_VERSION_KEY, error)
    return fallback
  }
}

const writeApiVersion = (value: ApiVersion): void => {
  try {
    storage.setString(API_VERSION_KEY, value)
  } catch (error) {
    console.warn('==settings: could not write', API_VERSION_KEY, error)
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
  /**
   * Which list shape the API serves. v2 collapses a multipart show (Part 1,
   * Part 2, …) into one row whose parts ride in `part_list`; v1 is the old
   * shape, one row per part. Default v2 — the toggle on Settings is the way
   * back. Long-lived, so MMKV holds it like the switches above.
   */
  apiVersion: ApiVersion
  setApiVersion: (value: ApiVersion) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  autoSyncFavorites: readBool(AUTO_SYNC_KEY, true),
  setAutoSyncFavorites: (value) => {
    writeBool(AUTO_SYNC_KEY, value)
    set({autoSyncFavorites: value})
  },
  apiVersion: readApiVersion('v2'),
  setApiVersion: (value) => {
    writeApiVersion(value)
    set({apiVersion: value})
  },
}))

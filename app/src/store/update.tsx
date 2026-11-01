import {create} from 'zustand'
import {Linking, Platform} from 'react-native'
import {MMKVLoader} from 'react-native-mmkv-storage'
import Constants from 'expo-constants'
import {fetchLatestVersion} from '@/helpers/network'

/**
 * "There is a newer visky than this one."
 *
 * The api owns the release number — `scripts/sync-version.sh` writes it into
 * every frontend, so the build knows which api it was made against and the api
 * knows which build everyone should be on. Asking it is the whole mechanism;
 * none of this talks to a store, and nothing here downloads anything.
 *
 * WHY A NOTICE AND NOT AN UPDATE. The three builds are updated in three
 * different places — TestFlight, the Play internal track, a signed .dmg — and
 * none of them can be driven from inside the app. What the app CAN do is stop
 * the listener wondering why a fix they were told about is not in their hands.
 */
/**
 * Where a new build actually comes from, per platform.
 *
 * The App Store id is the one scripts/lib/asc-api.js releases against, and the
 * Play listing is addressed by the same package name app.json declares — so
 * neither can drift from what is shipped without the release scripts noticing
 * first.
 *
 * The `itms-apps:`/`market:` forms open the store APP; the https ones are the
 * fallback for anything that cannot (a desktop webview, a simulator with no
 * store on it).
 */
const APP_STORE_ID = '6808513521'
const PACKAGE_NAME = 'com.envarg.visky'

export const storeName: string = Platform.select({
  ios: 'the App Store',
  android: 'Google Play',
  default: 'the downloads page',
}) as string

/**
 * The two sentences the notice is made of, per platform.
 *
 * Written out rather than assembled from `storeName`, because the preposition
 * is not the same in each: a build is IN the App Store and ON Google Play, and
 * the desktop has no store at all — it has a page with a .dmg on it. The glued
 * version read "visky 1.5.59 is in the downloads page".
 */
export const updateHeadline = (release: string): string =>
  Platform.select({
    ios: `visky ${release} is in the App Store`,
    android: `visky ${release} is on Google Play`,
    default: `visky ${release} is out`,
  }) as string

/** What to do about it, short enough for one line under the headline. */
export const updateAction: string = Platform.select({
  ios: 'Update in the App Store',
  android: 'Update on Google Play',
  default: 'Download the new build',
}) as string

const storeLinks: string[] = Platform.select({
  ios: [
    `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`,
    `https://apps.apple.com/app/id${APP_STORE_ID}`,
  ],
  android: [
    `market://details?id=${PACKAGE_NAME}`,
    `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}`,
  ],
  default: ['https://visky.envarg.com/'],
}) as string[]

/**
 * Open the store on this app's page.
 *
 * Tries the store app first and falls back to the web listing; a store that
 * cannot be opened at all is not an error worth showing — the notice has
 * already said which store to look in.
 */
export const openStore = async (): Promise<void> => {
  for (const link of storeLinks) {
    try {
      await Linking.openURL(link)
      return
    } catch (error) {
      console.debug('==update: could not open', link, error)
    }
  }
}

const storage = new MMKVLoader().withInstanceID('update').initialize()
const DISMISSED_KEY = 'dismissed-version'

/**
 * Remembering the dismissal on BOTH kinds of build.
 *
 * MMKV binds to a native module, and there is none in the Tauri shell — every
 * call throws there, which is the same reason the library cache has its own
 * fallbacks (store/library). Without this the desktop would have shown the
 * same notice again at every launch, however many times it was waved away, and
 * the ✕ would have read as broken. Same trade as helpers/device: localStorage
 * on web, the native store elsewhere.
 */
const recall = (): string | null => {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(DISMISSED_KEY)
    } catch {
      return null
    }
  }
  return storage.getString(DISMISSED_KEY) ?? null
}

const remember = (value: string): void => {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(DISMISSED_KEY, value)
    } catch {
      /* private mode: the notice stays away for this session only */
    }
    return
  }
  storage.setString(DISMISSED_KEY, value)
}

/** This build's own number, from app.json via the manifest. */
export const currentVersion: string = Constants.expoConfig?.version ?? '0.0.0'

/**
 * Compare two dotted versions numerically.
 *
 * `'1.5.9' < '1.5.10'` is false as strings and true as versions, and the
 * project has already shipped more than ten patches inside one minor — so the
 * string comparison would have gone quiet exactly when it started to matter.
 */
export const isNewer = (candidate: string, than: string): boolean => {
  const parse = (value: string) =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(candidate)
  const b = parse(than)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

const readDismissed = (): string | null => {
  try {
    return recall()
  } catch (error) {
    console.debug('==update: could not read the dismissed version', error)
    return null
  }
}

interface UpdateState {
  /** the release the server says is current, once it has answered */
  latest: string | null
  /** the newest version the listener has already waved away */
  dismissed: string | null
  check: () => Promise<void>
  dismiss: () => void
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  latest: null,
  dismissed: readDismissed(),

  check: async () => {
    const latest = await fetchLatestVersion()
    if (!latest || latest === get().latest) return
    set({latest})
  },

  dismiss: () => {
    const latest = get().latest
    if (!latest) return
    try {
      remember(latest)
    } catch (error) {
      console.debug('==update: could not remember the dismissal', error)
    }
    set({dismissed: latest})
  },
}))

/**
 * The version to tell the listener about, or null when there is nothing to say.
 *
 * Null covers three different silences: the server has not answered, this build
 * is current, and this particular release has already been waved away. A newer
 * one than the dismissed one speaks up again.
 */
export const availableUpdate = (state: Pick<UpdateState, 'latest' | 'dismissed'>): string | null => {
  const {latest, dismissed} = state
  if (!latest || !isNewer(latest, currentVersion)) return null
  if (dismissed && !isNewer(latest, dismissed)) return null
  return latest
}

export const useAvailableUpdate = (): string | null => useUpdateStore(availableUpdate)

export const checkForUpdate = (): void => {
  void useUpdateStore.getState().check()
}

import {create} from 'zustand'
import {Track} from 'react-native-track-player'
import {addToFavorites, loadFavoritesListData, removeFromFavorites} from '@/helpers/network'
import {trackKey} from '@/helpers/miscellaneous'

/**
 * Favourites are SERVER state.
 *
 * They live in the user's VK playlist "Frisky-favorites"; `/api/playlist/frisky`
 * marks every track it serves with `favorite`. This store holds two things on
 * top of that: the toggles made since the list was fetched (so a tapped heart
 * flips at once) and the favourites playlist itself, keyed by artist + title.
 *
 * Why artist + title and not the id: `audio.add` COPIES a track into the user's
 * library under a new id, so the frisky track and the copy in the playlist share
 * no id — only the artist and title survive. It also means the player can light
 * its heart for a track that reached it through the track-player queue, where
 * the `favorite` flag may not have travelled.
 *
 * TWO lists are tracked, not one. `keys` is whatever the Favorites tab is
 * showing — a playlist of the user's, or the VK library under "All" — and it is
 * what the rows of that tab light their hearts from. `friskyKeys` is
 * Frisky-favorites, always, and it is what the PLAYER reads: the player is not
 * inside anyone's list, and its heart went dark for every track the moment the
 * Favorites tab was switched to another playlist, because there was only one
 * map and the switch emptied it.
 *
 * The old local store (`useFavorites` in @/store/library) could not do any of
 * this: it kept an unresolved Promise in zustand state, matched tracks by `url`
 * (VK re-signs those on every fetch, so nothing ever matched) and never
 * persisted or uploaded anything.
 */
type FavoriteTrack = Track & {owner_id?: number; favorite?: boolean}

/** What a server-sent `favorite` flag is a statement ABOUT. */
export type FlagMeaning =
  /** the Frisky-favorites playlist — the Songs tab, the player, the suggestions */
  | 'frisky'
  /** the list on screen, whatever the picker selected */
  | 'scope'

/** identity of a track across VK copies — must match the API's `favoriteKey` */
export const favoriteTitleKey = (track: {artist?: string | null; title?: string | null} | null | undefined) =>
  track == null
    ? undefined
    : `${(track.artist ?? '').trim().toLowerCase()}|${(track.title ?? '').trim().toLowerCase()}`

/** one in-flight request per track PER LIST: the same track can be added to two */
const pendingKey = (scope: string | number | undefined, key: string) => `${scope ?? 'frisky'}:${key}`

interface FavoritesState {
  /**
   * Which list a heart writes to. The Favorites tab sets it from its picker;
   * everywhere else (Songs, the player) it is Frisky-favorites — `undefined`,
   * which the API reads as "the Frisky playlist, create it if needed".
   */
  scope: string | number | undefined
  setScope: (scope: string | number | undefined) => void
  /** artist|title of everything in the list the scope points at */
  keys: Record<string, boolean>
  /** artist|title of everything in Frisky-favorites, whatever the scope is */
  friskyKeys: Record<string, boolean>
  /** trackKey -> favourite in the scoped list, for tracks toggled in this session */
  overrides: Record<string, boolean>
  /** the same, for Frisky-favorites */
  friskyOverrides: Record<string, boolean>
  /** scope:trackKey -> true while its request is in flight */
  pending: Record<string, boolean>
  hydrate: () => Promise<void>
  setKeysFromTracks: (tracks: FavoriteTrack[]) => void
  applyServerFlags: (tracks: FavoriteTrack[], meaning?: FlagMeaning) => void
  /** add to / remove from the list the scope points at */
  toggleFavorite: (track: FavoriteTrack) => Promise<void>
  /** add to / remove from Frisky-favorites, whatever the Favorites tab is showing */
  toggleFriskyFavorite: (track: FavoriteTrack) => Promise<void>
  reset: () => void
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  scope: undefined,
  keys: {},
  friskyKeys: {},
  overrides: {},
  friskyOverrides: {},
  pending: {},

  setScope: (scope) => {
    const state = get()
    if (state.scope === scope) return
    // A different list means a different meaning for every heart on screen —
    // but NOT for the player's, which is always about Frisky-favorites.
    //
    // Going BACK to Frisky is not a blank slate: that list is already tracked,
    // and emptying it darkened every heart on the Songs tab until its tracks
    // happened to be fetched again — which coming back to a tab does not do.
    set(
      scope === undefined
        ? {scope, keys: {...state.friskyKeys}, overrides: {...state.friskyOverrides}}
        : {scope, keys: {}, overrides: {}},
    )
  },

  setKeysFromTracks: (tracks) => {
    const keys: Record<string, boolean> = {}
    for (const track of tracks) {
      const key = favoriteTitleKey(track)
      if (key) keys[key] = true
    }
    // the playlist is authoritative: replace, never merge, or an un-hearted
    // track would stay a favourite forever
    set({keys, overrides: {}, friskyKeys: keys, friskyOverrides: {}})
  },

  /**
   * The `favorite` flag the API put on each track of a list. Authoritative for
   * exactly those tracks, so their local toggles are dropped — the server has
   * spoken.
   *
   * `meaning` says which list it spoke about. The Songs tab and the suggestions
   * are told about Frisky-favorites; the Favorites tab showing someone's own
   * playlist is told about THAT playlist, where every row is a member by
   * construction — writing those into the frisky map would mark the whole
   * library a favourite.
   */
  applyServerFlags: (tracks, meaning: FlagMeaning = 'frisky') => {
    if (!tracks?.length) return
    set((state) => {
      const keys = {...state.keys}
      const overrides = {...state.overrides}
      const friskyKeys = {...state.friskyKeys}
      const friskyOverrides = {...state.friskyOverrides}
      for (const track of tracks) {
        const titleKey = favoriteTitleKey(track)
        if (!titleKey) continue
        const flag = Boolean(track.favorite)
        keys[titleKey] = flag
        const key = trackKey(track)
        if (key && !state.pending[pendingKey(state.scope, key)]) delete overrides[key]
        if (meaning === 'frisky') {
          friskyKeys[titleKey] = flag
          if (key && !state.pending[pendingKey(undefined, key)]) delete friskyOverrides[key]
        }
      }
      return {keys, overrides, friskyKeys, friskyOverrides}
    })
  },

  /**
   * Read Frisky-favorites once, without any tab having to be opened.
   *
   * The player can be the first thing on screen after a cold start — the queue
   * is restored, the artwork is there — and until this ran, its heart was dark
   * for a track that has been a favourite for months.
   */
  hydrate: async () => {
    try {
      const tracks = await loadFavoritesListData(null, (items: FavoriteTrack[]) => items)
      const keys: Record<string, boolean> = {}
      for (const track of tracks ?? []) {
        const key = favoriteTitleKey(track)
        if (key) keys[key] = true
      }
      set((state) => ({
        friskyKeys: keys,
        friskyOverrides: {},
        // the tab showing the same list must not disagree with it
        ...(state.scope === undefined ? {keys, overrides: {}} : {}),
      }))
    } catch (error) {
      console.warn('Unable to load the favorites', error)
    }
  },

  toggleFavorite: async (track) => toggleIn(set, get, track, get().scope),
  toggleFriskyFavorite: async (track) => toggleIn(set, get, track, undefined),

  reset: () => set({keys: {}, friskyKeys: {}, overrides: {}, friskyOverrides: {}, pending: {}}),
}))

/**
 * One toggle against one list.
 *
 * The scope is passed in rather than read off the store: the player hearts
 * Frisky-favorites no matter what the Favorites tab is showing, and it used to
 * write to whatever that was — hearting a track in the player after visiting
 * "All" DELETED it from the VK library.
 */
const toggleIn = async (
  set: (updater: (state: FavoritesState) => Partial<FavoritesState>) => void,
  get: () => FavoritesState,
  track: FavoriteTrack,
  scope: string | number | undefined,
): Promise<void> => {
  const key = trackKey(track)
  const titleKey = favoriteTitleKey(track)
  if (!key) return

  const state = get()
  const inFlight = pendingKey(scope, key)
  if (state.pending[inFlight]) return

  // this list's own view of the track: its toggles, then its key map, then
  // whatever the API said about the track itself
  const scoped = scope === state.scope
  const overrides = scope === undefined ? state.friskyOverrides : scoped ? state.overrides : {}
  const keys = scope === undefined ? state.friskyKeys : scoped ? state.keys : {}
  const current = overrides[key] ?? (titleKey ? keys[titleKey] : undefined) ?? Boolean(track.favorite)
  const next = !current

  const write = (value: boolean) =>
    set((live) => {
      const patch: Partial<FavoritesState> = {}
      if (scope === undefined) {
        patch.friskyOverrides = {...live.friskyOverrides, [key]: value}
        if (titleKey) patch.friskyKeys = {...live.friskyKeys, [titleKey]: value}
      }
      // the list on screen, when it is the one being written to
      if (scope === live.scope) {
        patch.overrides = {...live.overrides, [key]: value}
        if (titleKey) patch.keys = {...live.keys, [titleKey]: value}
      }
      return patch
    })

  // optimistic: the heart flips now, the request catches up
  write(next)
  set((live) => ({pending: {...live.pending, [inFlight]: true}}))

  try {
    if (next) {
      await addToFavorites(track, scope)
    } else {
      await removeFromFavorites(track, scope)
    }
  } catch (error) {
    console.error('Unable to toggle the favorite', error)
    // roll back, the server did not accept it
    write(current)
  } finally {
    set((live) => {
      const {[inFlight]: _dropped, ...rest} = live.pending
      return {pending: rest}
    })
  }
}

/**
 * Favourite state of a single track IN THE LIST ON SCREEN: the local toggle
 * first, then that list's key map, and finally whatever the API said about this
 * track.
 */
export const useIsFavorite = (track: FavoriteTrack | null | undefined) =>
  useFavoritesStore((state) => {
    const key = trackKey(track)
    if (!key) return false
    if (key in state.overrides) return state.overrides[key]

    const titleKey = favoriteTitleKey(track)
    if (titleKey && titleKey in state.keys) return state.keys[titleKey]

    return Boolean(track?.favorite)
  })

/**
 * The same question asked of Frisky-favorites, for a screen that is not a list:
 * the player, and anything else that shows the track that is playing.
 */
export const useIsFriskyFavorite = (track: FavoriteTrack | null | undefined) =>
  useFavoritesStore((state) => {
    const key = trackKey(track)
    if (!key) return false
    if (key in state.friskyOverrides) return state.friskyOverrides[key]

    const titleKey = favoriteTitleKey(track)
    if (titleKey && titleKey in state.friskyKeys) return state.friskyKeys[titleKey]

    return Boolean(track?.favorite)
  })

export const useToggleFavorite = () => useFavoritesStore((state) => state.toggleFavorite)

export const useToggleFriskyFavorite = () => useFavoritesStore((state) => state.toggleFriskyFavorite)

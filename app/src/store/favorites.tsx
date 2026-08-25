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
 * The old local store (`useFavorites` in @/store/library) could not do any of
 * this: it kept an unresolved Promise in zustand state, matched tracks by `url`
 * (VK re-signs those on every fetch, so nothing ever matched) and never
 * persisted or uploaded anything.
 */
type FavoriteTrack = Track & {owner_id?: number; favorite?: boolean}

/** identity of a track across VK copies — must match the API's `favoriteKey` */
export const favoriteTitleKey = (track: {artist?: string | null; title?: string | null} | null | undefined) =>
  track == null
    ? undefined
    : `${(track.artist ?? '').trim().toLowerCase()}|${(track.title ?? '').trim().toLowerCase()}`

interface FavoritesState {
  /**
   * Which list a heart writes to. The Favorites tab sets it from its picker;
   * everywhere else (Songs, the player) it is Frisky-favorites — `undefined`,
   * which the API reads as "the Frisky playlist, create it if needed".
   */
  scope: string | number | undefined
  setScope: (scope: string | number | undefined) => void
  /** artist|title of everything in the Frisky-favorites playlist */
  keys: Record<string, boolean>
  /** trackKey -> favourite, for tracks toggled in this session */
  overrides: Record<string, boolean>
  /** trackKey -> true while its request is in flight */
  pending: Record<string, boolean>
  hydrate: () => Promise<void>
  setKeysFromTracks: (tracks: FavoriteTrack[]) => void
  applyServerFlags: (tracks: FavoriteTrack[]) => void
  toggleFavorite: (track: FavoriteTrack) => Promise<void>
  reset: () => void
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  scope: undefined,
  keys: {},
  overrides: {},
  pending: {},

  setScope: (scope) => {
    if (get().scope === scope) return
    // a different list means a different meaning for every heart on screen
    set({scope, keys: {}, overrides: {}})
  },

  setKeysFromTracks: (tracks) => {
    const keys: Record<string, boolean> = {}
    for (const track of tracks) {
      const key = favoriteTitleKey(track)
      if (key) keys[key] = true
    }
    // the playlist is authoritative: replace, never merge, or an un-hearted
    // track would stay a favourite forever
    set({keys, overrides: {}})
  },

  /**
   * The `favorite` flag the API put on each track of a mixed list (the Songs
   * tab). Authoritative for exactly those tracks, so their local toggles are
   * dropped — the server has spoken.
   */
  applyServerFlags: (tracks) => {
    if (!tracks?.length) return
    set((state) => {
      const keys = {...state.keys}
      const overrides = {...state.overrides}
      for (const track of tracks) {
        const titleKey = favoriteTitleKey(track)
        if (!titleKey) continue
        keys[titleKey] = Boolean(track.favorite)
        const key = trackKey(track)
        if (key && !state.pending[key]) delete overrides[key]
      }
      return {keys, overrides}
    })
  },

  hydrate: async () => {
    try {
      const tracks = await loadFavoritesListData(null, (items: FavoriteTrack[]) => items)
      get().setKeysFromTracks(tracks ?? [])
    } catch (error) {
      console.warn('Unable to load the favorites', error)
    }
  },

  toggleFavorite: async (track) => {
    const key = trackKey(track)
    const titleKey = favoriteTitleKey(track)
    if (!key) return

    const {overrides, keys, pending} = get()
    if (pending[key]) return

    const current = overrides[key] ?? (titleKey ? keys[titleKey] : undefined) ?? Boolean(track.favorite)
    const next = !current

    // optimistic: the heart flips now, the request catches up
    set((state) => ({
      overrides: {...state.overrides, [key]: next},
      keys: titleKey ? {...state.keys, [titleKey]: next} : state.keys,
      pending: {...state.pending, [key]: true},
    }))

    try {
      const {scope} = get()
      if (next) {
        await addToFavorites(track, scope)
      } else {
        await removeFromFavorites(track, scope)
      }
    } catch (error) {
      console.error('Unable to toggle the favorite', error)
      // roll back, the server did not accept it
      set((state) => ({
        overrides: {...state.overrides, [key]: current},
        keys: titleKey ? {...state.keys, [titleKey]: current} : state.keys,
      }))
    } finally {
      set((state) => {
        const {[key]: _dropped, ...rest} = state.pending
        return {pending: rest}
      })
    }
  },

  reset: () => set({keys: {}, overrides: {}, pending: {}}),
}))

/**
 * Favourite state of a single track: the local toggle first, then the
 * favourites playlist, and finally whatever the API said about this track.
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

export const useToggleFavorite = () => useFavoritesStore((state) => state.toggleFavorite)

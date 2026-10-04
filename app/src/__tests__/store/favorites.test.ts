/**
 * The heart, and which list it is about.
 *
 * Two reports, one store: "сердечко в полном плеере" showing nothing for a
 * track that IS a favourite, and the Favorites tab's picker changing what a
 * heart anywhere else in the app means. Both came from a single key map shared
 * by the player and whatever list the picker had selected — switching to "All"
 * emptied it, and a toggle in the player then wrote to the VK LIBRARY, where
 * removing a favourite deletes the track outright.
 */
// `mock`-prefixed: jest hoists the factory above these declarations
const mockAdd = jest.fn().mockResolvedValue({})
const mockRemove = jest.fn().mockResolvedValue({})
const mockLoad = jest.fn()

jest.mock('@/helpers/network', () => ({
  addToFavorites: (...args: any[]) => mockAdd(...args),
  removeFromFavorites: (...args: any[]) => mockRemove(...args),
  loadFavoritesListData: (...args: any[]) => mockLoad(...args),
}))

import {useFavoritesStore} from '@/store/favorites'

const FRISKY_TRACK = {id: 1, owner_id: -42311167, artist: 'El Reyalto', title: 'Tech Coast Tribal'}
const OTHER_TRACK = {id: 2, owner_id: -42311167, artist: 'Fady Ferraye', title: 'Hurly Burly'}

const isFrisky = (track: any) => {
  const state = useFavoritesStore.getState()
  const key = `${track.owner_id}_${track.id}`
  if (key in state.friskyOverrides) return state.friskyOverrides[key]
  const titleKey = `${track.artist.toLowerCase()}|${track.title.toLowerCase()}`
  return state.friskyKeys[titleKey] ?? false
}

beforeEach(() => {
  jest.clearAllMocks()
  useFavoritesStore.setState({scope: undefined})
  useFavoritesStore.getState().reset()
})

describe('the player heart', () => {
  it('survives the Favorites tab switching to another list', () => {
    useFavoritesStore.getState().setKeysFromTracks([FRISKY_TRACK] as any)
    expect(isFrisky(FRISKY_TRACK)).toBe(true)

    // the picker moves to "All" — the rows on that tab now mean something else
    useFavoritesStore.getState().setScope('all')

    expect(useFavoritesStore.getState().keys).toEqual({})
    expect(isFrisky(FRISKY_TRACK)).toBe(true)
  })

  it('comes back with the hearts it already knew when the tab returns to Frisky', () => {
    useFavoritesStore.getState().setKeysFromTracks([FRISKY_TRACK] as any)
    useFavoritesStore.getState().setScope('all')
    useFavoritesStore.getState().setScope(undefined)

    // the Songs tab does not refetch on focus; a blank map left every heart
    // there dark until it did
    const titleKey = `${FRISKY_TRACK.artist.toLowerCase()}|${FRISKY_TRACK.title.toLowerCase()}`
    expect(useFavoritesStore.getState().keys[titleKey]).toBe(true)
  })

  it('is not lit by a playlist view, where every row is a member by construction', () => {
    useFavoritesStore.getState().setScope('all')
    // the API marks every track of the list it serves
    useFavoritesStore.getState().applyServerFlags([{...OTHER_TRACK, favorite: true}] as any, 'scope')

    expect(isFrisky(OTHER_TRACK)).toBe(false)
  })

  it('takes the Songs tab at its word: those flags ARE Frisky-favorites', () => {
    useFavoritesStore.getState().applyServerFlags([{...OTHER_TRACK, favorite: true}] as any)
    expect(isFrisky(OTHER_TRACK)).toBe(true)
  })

  it('reads the playlist once, with no tab opened', async () => {
    mockLoad.mockResolvedValueOnce([FRISKY_TRACK])
    await useFavoritesStore.getState().hydrate()
    expect(isFrisky(FRISKY_TRACK)).toBe(true)
  })
})

describe('toggling', () => {
  it('writes to Frisky-favorites from the player, whatever the tab is showing', async () => {
    useFavoritesStore.getState().setScope('all')

    await useFavoritesStore.getState().toggleFriskyFavorite(FRISKY_TRACK as any)

    // undefined = the Frisky playlist. 'all' would have added it to the VK
    // library, and un-hearting it there DELETES it.
    expect(mockAdd).toHaveBeenCalledWith(FRISKY_TRACK, undefined)
    expect(isFrisky(FRISKY_TRACK)).toBe(true)
  })

  it('writes to the selected list from a row of that list', async () => {
    useFavoritesStore.getState().setScope(42)
    useFavoritesStore.getState().applyServerFlags([{...OTHER_TRACK, favorite: true}] as any, 'scope')

    await useFavoritesStore.getState().toggleFavorite(OTHER_TRACK as any)

    expect(mockRemove).toHaveBeenCalledWith(OTHER_TRACK, 42)
    // taken out of playlist 42, still in Frisky-favorites as far as anyone knows
    expect(useFavoritesStore.getState().overrides[`${OTHER_TRACK.owner_id}_${OTHER_TRACK.id}`]).toBe(false)
  })

  it('rolls the heart back when the server refuses', async () => {
    mockAdd.mockRejectedValueOnce(new Error('nope'))
    const noise = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await useFavoritesStore.getState().toggleFriskyFavorite(FRISKY_TRACK as any)

    expect(isFrisky(FRISKY_TRACK)).toBe(false)
    expect(useFavoritesStore.getState().pending).toEqual({})
    noise.mockRestore()
  })
})

import { unknownTrackImageUri } from '@/constants/images'
import { Artist, Playlist, TrackWithPlaylist } from '@/helpers/types'
import { Track } from 'react-native-track-player'
import { create } from 'zustand'
import {MMKVLoader, useMMKVStorage} from "react-native-mmkv-storage";
import {isSameTrack} from "@/helpers/miscellaneous";

interface LibraryState {
  tracks: Promise<TrackWithPlaylist[]>
  toggleTrackFavorite: (track: Track) => void
  addToPlaylist: (track: Track, playlistName: string) => void
}
export const storage = new MMKVLoader().withInstanceID('playlist').initialize();

/**
 * The MMKV keys the tab windows mirror their first page to.
 *
 * They live here, beside the instance they are written to, because they have a
 * SECOND reader: services/car.ts builds the CarPlay and Android Auto tree from
 * exactly what the app's own screens are showing. That reader used to go
 * through `useLibraryStore` below, whose `tracks` come from the `'tracks'` key
 * — which nothing has written since the tabs moved to windowed loading. The
 * result was a car with an empty Favorites tab and an empty Artists tab and no
 * error anywhere: the same failure the note about `rating === 1` in
 * store/favorites warns about, reading a field nobody maintains.
 */
export const SONGS_CACHE_KEY = 'songs-window'
export const FAVORITES_CACHE_KEY = 'favorites-window'

/**
 * The same page again, in memory.
 *
 * MMKV is a native module. On the web and desktop builds there is no
 * `NativeModules.MMKVStorage` to bind to, so every read above comes back empty
 * — which did not matter while the only readers were the car and the watch,
 * neither of which runs there. The playback reconciler is a third reader and
 * does run there, and a device that cannot read the list rebuilds a queue of
 * ONE track: the show then stops at the end of it with nothing to move to.
 *
 * Written beside the MMKV mirror, from the same call, and read when MMKV has
 * nothing. It does not survive a reload, which is the honest limit: on the web
 * the list has to have been on screen once this session.
 */
const windows = new Map<string, TrackWithPlaylist[]>()

export const rememberWindow = (key: string, items: TrackWithPlaylist[]): void => {
  windows.set(key, items)
}

/** The cached page as plain data, for readers outside React. Empty, never throws. */
export const cachedTracks = async (key: string): Promise<TrackWithPlaylist[]> => {
  try {
    const stored = await storage.getArrayAsync<TrackWithPlaylist>(key)
    if (stored?.length) return stored
  } catch (error) {
    console.warn('==library: could not read', key, error)
  }
  return windows.get(key) ?? []
}
const getTracks = async ():Promise<TrackWithPlaylist[]> => {
  //const [tracks, setTracks] = useMMKVStorage<TrackWithPlaylist[]>('tracks', storage, []);
  try {
    const tracks = await storage.getArrayAsync<TrackWithPlaylist>('tracks')
    return tracks ?? []
  } catch (error) {
    // MMKV is a native module and there is none on the web or desktop build.
    // The promise this returns is created while the store is still being
    // constructed, with nobody to catch it: unguarded, importing this module
    // raised an unhandled rejection before any screen had rendered.
    console.warn('==library: could not read the legacy track cache', error)
    return []
  }
}
export const useLibraryStore = create<LibraryState>()((set) => ({
  tracks: getTracks().then((tracks) => tracks.map((item:TrackWithPlaylist ) => ({
    ...item,
    date: item?.date?.toString(),
    album: item?.album?.title ?? 'Unknown Album',
    artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300,
  }))),
  toggleTrackFavorite: (track) =>
    set((state) => ({
      tracks: state.tracks.then((tracks) => tracks.map((currentTrack) => {
        if (isSameTrack(currentTrack, track)) {
          return {
            ...currentTrack,
            rating: currentTrack.rating === 1 ? 0 : 1,
          }
        }

        return currentTrack
      })),
    })),
  addToPlaylist: (track, playlistName) =>
    set((state) => ({
      tracks: state.tracks.then((tracks) => tracks.map((currentTrack) => {
        if (isSameTrack(currentTrack, track)) {
          return {
            ...currentTrack,
            playlist: [...(currentTrack.playlist ?? []), playlistName],
          }
        }

        return currentTrack
      })),
    })),
}))

export const useTracks = () => useLibraryStore((state) => state.tracks.then((tracks) => tracks as Track[]))

export const useFavorites = () => {
  const favorites = useLibraryStore((state) => state.tracks.then((tracks) => tracks.filter((track) => track.rating === 1)))
  const toggleTrackFavorite = useLibraryStore((state) => state.toggleTrackFavorite)

  return {
    favorites,
    toggleTrackFavorite,
  }
}

export const useArtists = () =>
  useLibraryStore((state) => {
    return state.tracks.then((tracks) => tracks.reduce((acc, track) => {
      const existingArtist = acc.find((artist) => artist.name === track.artist)

      if (existingArtist) {
        existingArtist.tracks.push({
          ...track,
          date: track.date?.toString()
        })
      } else {
        acc.push({
          name: track.artist ?? 'Unknown',
          tracks: [{
            ...track,
            date: track.date?.toString()
          }],
        })
      }

      return acc
    }, [] as Artist[]))
  })

export const usePlaylists = () => {
  const playlists = useLibraryStore((state) => {
    return state.tracks.then((tracks) => tracks.reduce((acc, track) => {
      track.playlist?.forEach((playlistName) => {
        const existingPlaylist = acc.find((playlist) => playlist.name === playlistName)

        if (existingPlaylist) {
          existingPlaylist.tracks.push({
            ...track,
            date: track.date?.toString()
          })
        } else {
          acc.push({
            name: playlistName,
            tracks: [{
              ...track,
              date: track.date?.toString()
            }],
            artworkPreview: track.artwork ?? unknownTrackImageUri,
          })
        }
      })

      return acc
    }, [] as Playlist[]))
  })

  const addToPlaylist = useLibraryStore((state) => state.addToPlaylist)

  return {playlists, addToPlaylist}
}

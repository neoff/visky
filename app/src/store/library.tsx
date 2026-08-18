import { unknownTrackImageUri } from '@/constants/images'
import { Artist, Playlist, TrackWithPlaylist } from '@/helpers/types'
import { Track } from 'react-native-track-player'
import { create } from 'zustand'
import {MMKVLoader, useMMKVStorage} from "react-native-mmkv-storage";

interface LibraryState {
  tracks: Promise<TrackWithPlaylist[]>
  toggleTrackFavorite: (track: Track) => void
  addToPlaylist: (track: Track, playlistName: string) => void
}
export const storage = new MMKVLoader().withInstanceID('playlist').initialize();
const getTracks = async ():Promise<TrackWithPlaylist[]> => {
  //const [tracks, setTracks] = useMMKVStorage<TrackWithPlaylist[]>('tracks', storage, []);
  const tracks = await storage.getArrayAsync<TrackWithPlaylist>('tracks')
  return tracks ?? []
}
export const useLibraryStore = create<LibraryState>()((set) => ({
  tracks: getTracks().then((tracks) => tracks.map((item:TrackWithPlaylist ) => ({
    ...item,
    date: item?.date?.toString(),
    album: item?.album?.title ?? 'Unknown Album',
    artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
  }))),
  toggleTrackFavorite: (track) =>
    set((state) => ({
      tracks: state.tracks.then((tracks) => tracks.map((currentTrack) => {
        if (currentTrack.url === track.url) {
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
        if (currentTrack.url === track.url) {
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

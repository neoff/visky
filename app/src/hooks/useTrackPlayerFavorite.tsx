import {useActiveTrack} from 'react-native-track-player'
import {useIsFavorite, useToggleFavorite} from '@/store/favorites'

/**
 * Favourite state of the track that is playing.
 *
 * Everything here used to be local and broken: `favorites` was an unresolved
 * Promise (so `isFavorite ? …` was ALWAYS truthy), tracks were matched by `url`
 * — VK re-signs those on every fetch — and nothing was ever sent to VK. The
 * store now owns it; this hook is only the player-shaped view of it.
 */
export const useTrackPlayerFavorite = () => {
  const activeTrack = useActiveTrack()
  const isFavorite = useIsFavorite(activeTrack)
  const toggle = useToggleFavorite()

  const toggleFavorite = async () => {
    if (!activeTrack) return
    await toggle(activeTrack)
  }

  return {isFavorite, toggleFavorite}
}

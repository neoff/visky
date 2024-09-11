import { useEffect, useRef } from 'react'
import TrackPlayer, { Capability, RatingType, RepeatMode } from 'react-native-track-player'

const setupPlayer = async () => {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
  })

  await TrackPlayer.updateOptions({
    ratingType: RatingType.Heart,
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.JumpForward,
      Capability.JumpBackward,
      Capability.Like,
      Capability.Dislike,
      Capability.Stop,
    ],
  })

  await TrackPlayer.setVolume(1.0) // not too loud
  await TrackPlayer.setRepeatMode(RepeatMode.Off)
}

export const useSetupTrackPlayer = ({onLoad, init}: { onLoad: () => void, init:boolean }) => {
  useEffect(() => {
    if (init) return
    setupPlayer()
      .then(() => {
        onLoad?.()
      })
      .catch((error) => {
        console.error(error)
      })
  }, [onLoad])
}

import { useEffect, useRef } from 'react'
import TrackPlayer, {AppKilledPlaybackBehavior, Capability, RatingType, RepeatMode} from 'react-native-track-player'

export const setupPlayer = async () => {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
  })

  await TrackPlayer.updateOptions({
    ratingType: RatingType.Heart,
    android: {
      appKilledPlaybackBehavior:
      AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      alwaysPauseOnInterruption: true,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.JumpForward,
      Capability.JumpBackward,
      Capability.Stop,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
    ],
  })

  //await TrackPlayer.setVolume(1.0)
  await TrackPlayer.setRepeatMode(RepeatMode.Off)
}

export const useSetupTrackPlayer = ({onLoad, init}: { onLoad: () => void, init:boolean }) => {
  useEffect(() => {
    console.log('-TRY->useSetupTrackPlayer')
    if (init) return
    console.log('-->useSetupTrackPlayer')
    setupPlayer()
      .then(() => {
        onLoad?.()
      })
      .catch((error) => {
        console.error(error)
      })
  }, [onLoad])
}

import PlayerRegisterService from "@/components/PlayerRegisterService";
import { useEffect } from 'react';
import TrackPlayer, { Capability, RatingType, RepeatMode } from 'react-native-track-player';

/*export const setupPlayer = async () => {
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
}*/
const setupPlayer = async () => {
  //const [cachedState, setCachedState] = useMMKVStorage<IPlayerState>('player', storage, PlayerState);
  //const cachedState: IPlayerState = await storage.getItem('player')
  const repeatMode = /*cachedState?.repeatMode || */RepeatMode.Off
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
      Capability.Stop,
    ],
  })

  await TrackPlayer.setVolume(1.0) // not too loud
  await TrackPlayer.setRepeatMode(repeatMode)
}

export const useSetupTrackPlayer = ({onLoad, init}: { onLoad: () => void, init:boolean }) => {
  useEffect(() => {
    console.log('-TRY->useSetupTrackPlayer')
    if (init) return
    console.log('-->useSetupTrackPlayer')
    TrackPlayer.registerPlaybackService(() => PlayerRegisterService);
    setupPlayer()
      .then(() => {
        onLoad?.()
      })
      .catch((error) => {
        console.error(error)
      })
  }, [onLoad])
}

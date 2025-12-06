// src/hooks/useSetupTrackPlayer.tsx
import PlayerRegisterService from "@/components/PlayerRegisterService";
import { useEffect } from 'react';
import TrackPlayer, {AppKilledPlaybackBehavior, Capability, RatingType, RepeatMode} from 'react-native-track-player';
const setupPlayer = async () => {
  try {
    // Check if player is already setup
    const state = await TrackPlayer.getPlaybackState();
    console.log('Player already initialized, skipping setup');
    return;
  } catch {
    // Player not initialized yet, proceed with setup
  }

  const repeatMode = RepeatMode.Off
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 20,
  })

  await TrackPlayer.updateOptions({
    ratingType: RatingType.Heart,
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      alwaysPauseOnInterruption: true,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      //Capability.JumpForward,
      //Capability.JumpBackward,
      Capability.Stop,
    ],
    /*compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
    ],*/
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

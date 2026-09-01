import PlayerRegisterService from "@/components/PlayerRegisterService";
import { useEffect } from 'react';
import TrackPlayer, {
  AndroidAudioContentType,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  RatingType,
  RepeatMode,
} from 'react-native-track-player';

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
    // Let the platform arbitrate audio focus for us. A phone call takes focus
    // away transiently: playback pauses and starts again by itself when the
    // call ends. A notification sound (an SMS) only asks to duck, and with
    // content type Music the system lowers our volume for the length of it
    // instead of stopping the show — see `alwaysPauseOnInterruption` below.
    autoHandleInterruptions: true,
    androidAudioContentType: AndroidAudioContentType.Music,
    iosCategory: IOSCategory.Playback,
    iosCategoryMode: IOSCategoryMode.Default,
  })

  await TrackPlayer.updateOptions({
    ratingType: RatingType.Heart,
    // Turns Event.PlaybackProgressUpdated on — it does not fire at all without
    // an interval. The playback service uses it to warm the next track before
    // the current one ends (services/prefetch). Ten seconds is fine grained
    // enough for a 90-second lead and cheap enough to run for a whole show.
    progressUpdateEventInterval: 10,
    android: {
      // false = a short interruption ducks instead of pausing
      alwaysPauseOnInterruption: false,
    },
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

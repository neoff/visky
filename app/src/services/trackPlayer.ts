import TrackPlayer, {
  AndroidAudioContentType,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  RatingType,
  RepeatMode,
} from 'react-native-track-player';

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

/**
 * Set the player up once per JS runtime, and hand the same promise to everyone
 * after.
 *
 * There are two ways in now. Normally the UI mounts and `useSetupTrackPlayer`
 * runs this. But Android Automotive starts a HEADLESS runtime to answer a tap
 * in the car -- nothing mounts, no hook ever runs, and the first thing to touch
 * TrackPlayer is the car command handler. Whichever arrives first has to be
 * able to say "make sure the player exists" without knowing about the other;
 * RNTP answers the one that guesses wrong with

 *   Error: The player is not initialized. Call setupPlayer first.
 *
 * which is exactly what the car did before this existed.
 *
 * The playback service is registered with a lazy require rather than a top
 * level import. PlayerRegisterService imports services/car, which imports this
 * module -- an import cycle that would resolve to undefined at module-eval
 * time. Deferring it to the call breaks the cycle, and a factory is what
 * `registerPlaybackService` wants anyway.
 */
let ready: Promise<void> | null = null

export const ensureTrackPlayer = (): Promise<void> => {
  if (ready) return ready

  ready = (async () => {
    TrackPlayer.registerPlaybackService(
      () => require('@/components/PlayerRegisterService').default,
    )
    await setupPlayer()
  })().catch((error) => {
    // Never cache a failed setup as success: the next caller should get to try
    // again rather than inherit a player that was never made.
    ready = null
    throw error
  })

  return ready
}

import TrackPlayer, { Event, State } from "react-native-track-player";
import { prefetchNextTrack } from "@/services/prefetch";
import { startCarLink } from "@/services/car";
import { startWatchLink } from "@/services/watch";

/**
 * Was the show playing when something took the audio away?
 *
 * The platform pauses us for a phone call and hands focus back when it ends —
 * this remembers whether there was anything to resume, so a call does not leave
 * the app silently stopped mid-episode. A notification sound never gets here:
 * with `alwaysPauseOnInterruption: false` the system just ducks the volume for
 * as long as it plays.
 */
let resumeAfterInterruption = false;

const PlayerRegisterService = async () => {
  try {
    TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
      if (event.permanent) {
        // focus is gone for good (another player took over): stop and stay stopped
        resumeAfterInterruption = false;
        await TrackPlayer.pause();
        return;
      }

      if (event.paused) {
        const {state} = await TrackPlayer.getPlaybackState();
        resumeAfterInterruption = state === State.Playing || state === State.Buffering;
        await TrackPlayer.pause();
        return;
      }

      // the interruption is over
      if (resumeAfterInterruption) {
        resumeAfterInterruption = false;
        await TrackPlayer.play();
      }
    });

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      TrackPlayer.play()
    })
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      TrackPlayer.play()
    })

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      TrackPlayer.pause()
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      TrackPlayer.skipToNext()
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      TrackPlayer.skipToPrevious()
    });

    // Warm the NEXT track before this one runs out.
    //
    // This listener lives in the playback service rather than in a hook on
    // purpose: the service survives the screen going off, and an hour-long mix
    // is played with the phone in a pocket. A timer in the UI would be frozen
    // by the OS exactly when the hand-over happens.
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      void prefetchNextTrack(event.position, event.duration);
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      TrackPlayer.stop()
    });

    // Mirror playback onto the Apple Watch and the car, and take their
    // commands. Registered here for the same reason as the prefetch above: both
    // are used while the phone is in a pocket or a cradle, which is exactly
    // when a screen's listeners are gone. Each no-ops where its native module
    // is absent — the watch on Android, the car on web, both on any binary
    // built before they existed.
    startWatchLink();
    startCarLink();
  } catch (error) { }

}

export default PlayerRegisterService;
import TrackPlayer, { Event, State } from "react-native-track-player";

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

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      TrackPlayer.stop()
    });
  } catch (error) { }

}

export default PlayerRegisterService;
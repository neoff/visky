import TrackPlayer, { Event, State } from "react-native-track-player";
import { prefetchNextTrack } from "@/services/prefetch";
import { noteActiveTrackChanged, notePosition, recoverFromPlaybackError } from "@/services/recovery";
import { runLocalAction } from "@/services/playbackReconciler";
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

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      TrackPlayer.pause()
    });

    // The lock screen, the headset button and the car's own ⏭ are the same
    // deliberate switch as the button in the app, so they take the same claim
    // on the session — without it the reconciler applies a frame written before
    // the press and skips back to the track that was just left (issue #4).
    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      void runLocalAction(() => TrackPlayer.skipToNext())
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      void runLocalAction(() => TrackPlayer.skipToPrevious())
    });

    // Warm the NEXT track before this one runs out.
    //
    // This listener lives in the playback service rather than in a hook on
    // purpose: the service survives the screen going off, and an hour-long mix
    // is played with the phone in a pocket. A timer in the UI would be frozen
    // by the OS exactly when the hand-over happens.
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      // Where the show actually is, remembered for the recovery below: by the
      // time a failure is reported the player may already have moved on, and
      // then its own state no longer says what broke or where it was.
      notePosition(event.position, event.duration);
      void prefetchNextTrack(event.position, event.duration);
    });

    // Which track left, and whether it had run out or was cut off. Both are in
    // the event and nowhere else by the time an error arrives.
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
      noteActiveTrackChanged(event);
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      TrackPlayer.stop()
    });

    // A track that will not load is nearly always a VK link that aged out, and
    // the answer is to re-sign it and carry on — see services/recovery. Here
    // rather than in a screen for the same reason as the prefetch above: the
    // hand-over that fails most is the one an hour into a show, with the phone
    // in a pocket and no UI mounted.
    //
    // `next_track_load_failed` is ours: the web player reports the hand-over it
    // could not make (patches/react-native-track-player), and there the broken
    // entry is the one AFTER the track that just ended, not the active one.
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      const failedAt = (event as {code?: string}).code === 'next_track_load_failed'
        ? 'next'
        : 'current'
      void recoverFromPlaybackError(failedAt)
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
import {useCallback, useEffect, useRef} from "react";
import {View, Text, ViewProps} from "react-native";
import TrackPlayer, {useActiveTrack, useProgress} from "react-native-track-player";
import {useSharedValue} from "react-native-reanimated";
import {formatSecondsToMinutes, trackKey} from "@/helpers/miscellaneous";
import {runLocalAction} from "@/services/playbackReconciler";
import {playbackSync} from "@/services/playbackSync";
import {Slider} from "react-native-awesome-slider";
import {progressBarStyles, utilsStyles} from "@/styles";

/**
 * How close the player has to get to a requested position before its own
 * reports are believed again. A seek is not instant — the audio element keeps
 * reporting the OLD second for a beat, and letting that through yanks the bar
 * back to where the user dragged it FROM, which reads as "the seek did
 * nothing".
 */
const SEEK_LANDED_S = 1.5

/** ...and how long to wait for it before giving up on that. */
const SEEK_TIMEOUT_MS = 4_000

/**
 * Where a tap on the bar actually lands, in seconds.
 *
 * Pure, and exported, because the arithmetic is where a seek quietly dies: with
 * a duration of `Infinity` — which a media element reports for a stream it
 * considers unfinished, and WKWebView does exactly that for VK's HLS when it
 * plays it natively — `fraction * duration` is `Infinity`, and a player handed
 * `Infinity` ignores the request. The old guard did not catch it either, since
 * `Infinity > 0` is perfectly true.
 *
 * `null` means "there is nothing sensible to seek to", which is a different
 * answer from second zero.
 */
export const seekTarget = (fraction: number, duration: number): number | null => {
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(fraction)) return null
  // Never land ON the end. The player treats reaching the last frame as "track
  // finished" and moves to the next one — which is how dragging to the
  // right-hand edge started playing something else.
  return Math.min(Math.max(fraction, 0) * duration, Math.max(duration - 1, 0))
}

export const PlayerProgressBar = ({ style }: ViewProps) => {
  const { duration: reported, position, buffered } = useProgress(250)
  const activeTrack = useActiveTrack()

  // The player's own duration, unless it is not a number we can do arithmetic
  // with. VK tells us how long the show is and the queue carries it, so there
  // is a second source — and on the desktop it is the only one that works.
  const trackDuration = Number((activeTrack as {duration?: number} | undefined)?.duration ?? 0)
  const duration =
    Number.isFinite(reported) && reported > 0
      ? reported
      : Number.isFinite(trackDuration) && trackDuration > 0
        ? trackDuration
        : 0

  const progress = useSharedValue(0)
  const min = useSharedValue(0)
  const max = useSharedValue(1)
  const cache = useSharedValue(0)

  // Plain refs, not shared values: both are written and read on the JS thread
  // only (the slider's callbacks arrive here through runOnJS), and a shared
  // value read during render is exactly what this component used to do wrong.
  const sliding = useRef(false)
  const seek = useRef<{to: number; at: number} | null>(null)

  // The bar follows the player from an EFFECT. It used to be assigned in the
  // render body, which Reanimated does not allow and which also meant every
  // `useProgress` tick — four a second — snapped the thumb back out from under
  // the finger mid-drag.
  useEffect(() => {
    if (sliding.current) return

    if (seek.current) {
      const landed = Math.abs(position - seek.current.to) <= SEEK_LANDED_S
      const expired = Date.now() - seek.current.at > SEEK_TIMEOUT_MS
      if (!landed && !expired) return
      seek.current = null
    }

    progress.value = duration > 0 ? position / duration : 0
    cache.value = duration > 0 ? buffered / duration : 0
  }, [position, duration, buffered, cache, progress])

  const seekToFraction = useCallback(
    async (value: number) => {
      // Nothing is loaded yet, or the duration is not a usable number: seeking
      // into either puts the player in a state it has to be kicked out of.
      const target = seekTarget(value, duration)
      if (target === null) {
        console.warn('==player: no usable duration to seek within', {reported, trackDuration})
        return
      }

      seek.current = {to: target, at: Date.now()}
      progress.value = target / duration
      try {
        // Inside the session's lock, like every other deliberate change (see
        // services/playbackReconciler.runLocalAction). A seek moves the needle
        // and nothing else, so the frames in flight still carry the position
        // the track was at a moment ago — and this device is usually the active
        // one, which means the reconciler believes them and seeks BACK. That
        // reads as "the bar moved and the sound did not".
        await runLocalAction(() => TrackPlayer.seekTo(target))
        // ...and tell the session straight away. Nothing else reports a seek:
        // play/pause is what the state listener watches, so until the next
        // five-second heartbeat the account still thought the show was where it
        // had been, and any other device following along was wrong for that long.
        playbackSync.sendProgress(
          target * 1000,
          await TrackPlayer.getPlayWhenReady(),
          trackKey((await TrackPlayer.getActiveTrack()) as never) ?? undefined,
        )
      } catch (error) {
        seek.current = null
        console.warn('==player: could not seek', error)
      }
    },
    [duration, reported, trackDuration, progress],
  )

  return (
    <View style={style}>
      <Slider
        progress={progress}
        cache={cache}
        minimumValue={min}
        maximumValue={max}
        containerStyle={utilsStyles.slider}
        // Root height matched to the track it draws (the default 5 left the
        // 7pt track overhanging its own parent).
        sliderHeight={7}
        thumbWidth={0}
        renderBubble={() => null}
        // A zero-width thumb still renders a View carrying the played-track
        // colour. Nothing should be drawn there at all.
        renderThumb={() => null}
        // Three tones, and they have to READ as three. The old set had the
        // played part at 60% white and the buffer at 25% blue ON TOP of a 40%
        // white track — which composites BRIGHTER than the played part. At
        // 2:32 of a 58-minute set that painted a bright bar out to the 85% the
        // buffer had reached, and the position looked like it had run away.
        theme={{
          maximumTrackTintColor: 'rgba(255,255,255,0.22)',
          cacheTrackTintColor: 'rgba(255,255,255,0.2)',
          minimumTrackTintColor: '#ffffff',
        }}

        onSlidingStart={() => {
          sliding.current = true
        }}
        // Deliberately no `onValueChange` handler. The slider fires it on every
        // pixel of a drag, and seeking on each one sent a burst of seeks at the
        // player — which is what made playback tear and sometimes skip a track
        // outright. The thumb follows the finger on its own; only the final
        // position is a request.
        onSlidingComplete={(value) => {
          // Reached from a drag AND from a tap: the slider calls this for both,
          // but calls `onSlidingStart` only for the drag. The old guard bailed
          // out whenever `isSliding` was false, so a plain tap on the bar was
          // dropped — the "sometimes it seeks, sometimes it doesn't" half.
          sliding.current = false
          void seekToFraction(value)
        }}
      />

      <View style={progressBarStyles.timeRow}>
        <Text style={progressBarStyles.timeText}>{formatSecondsToMinutes(position)}</Text>

        <Text style={progressBarStyles.timeText}>
          {'-'} {formatSecondsToMinutes(Math.max(duration - position, 0))}
        </Text>
      </View>
    </View>
  )
}

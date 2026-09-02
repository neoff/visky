import {useCallback, useEffect, useRef} from "react";
import {View, Text, ViewProps} from "react-native";
import TrackPlayer, {useProgress} from "react-native-track-player";
import {useSharedValue} from "react-native-reanimated";
import {formatSecondsToMinutes} from "@/helpers/miscellaneous";
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

export const PlayerProgressBar = ({ style }: ViewProps) => {
  const { duration, position, buffered } = useProgress(250)

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
      // Nothing is loaded yet: seeking into a zero-length track puts the player
      // in a state it has to be kicked out of.
      if (!(duration > 0)) return

      // Never land ON the end. The player treats reaching the last frame as
      // "track finished" and moves to the next one — which is how dragging to
      // the right-hand edge started playing something else.
      const target = Math.min(Math.max(value, 0) * duration, Math.max(duration - 1, 0))

      seek.current = {to: target, at: Date.now()}
      progress.value = target / duration
      try {
        await TrackPlayer.seekTo(target)
      } catch (error) {
        seek.current = null
        console.warn('==player: could not seek', error)
      }
    },
    [duration, progress],
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

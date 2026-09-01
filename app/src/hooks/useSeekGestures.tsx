import {useCallback, useEffect, useRef} from 'react'
import TrackPlayer from 'react-native-track-player'

/**
 * Press-and-hold scrubbing for the skip buttons.
 *
 * Holding seeks by ±10 s and KEEPS GOING while the finger is down, once every
 * 400 ms. A single jump on long-press would make a two-hour mix unnavigable —
 * the point of holding is to travel.
 *
 * The tap and the hold never both fire: React Native calls `onPress` OR
 * `onLongPress`, never both, so releasing after a scrub does not also change
 * the track.
 */
export const SEEK_STEP_SECONDS = 10
const REPEAT_MS = 400

export const useHoldToSeek = (direction: 1 | -1) => {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  const seek = useCallback(() => {
    // seekBy is relative and clamps itself at both ends, so holding past the
    // start or the end of a track is a no-op rather than an error.
    TrackPlayer.seekBy(direction * SEEK_STEP_SECONDS).catch((error) => {
      console.warn('==controls: seek failed', error)
      stop()
    })
  }, [direction, stop])

  const start = useCallback(() => {
    stop()
    seek()
    timer.current = setInterval(seek, REPEAT_MS)
  }, [seek, stop])

  // A finger still down when the screen unmounts would otherwise leave the
  // interval running against a player that is no longer on screen.
  useEffect(() => stop, [stop])

  return {onLongPress: start, onPressOut: stop}
}

import {useCallback, useEffect, useRef} from "react";
import {TouchableOpacity, View, ViewProps} from "react-native";
import {useSharedValue} from "react-native-reanimated";
import {Ionicons} from "@expo/vector-icons";
import {colors} from "@/constants";
import {Slider} from "react-native-awesome-slider";
import {useTrackPlayerVolume} from "@/hooks/useTrackPlayerVolume";
import {utilsStyles} from "@/styles";

/** How much one press of a speaker icon moves the volume. */
const VOLUME_STEP = 0.1
/** How long a press has to be held before it starts repeating. */
const HOLD_DELAY_MS = 350
/** ...and how fast it repeats then — the full range in about a second. */
const HOLD_REPEAT_MS = 120

export const PlayerVolumeBar = ({ style }: ViewProps) => {
  // The real thing now. This used to be `const volume = 1.0` with an
  // `updateVolume` that only wrote to the console: the bar drew itself at 100%
  // for ever and dragging it did nothing.
  const {volume, updateVolume} = useTrackPlayerVolume()

  const progress = useSharedValue(1)
  const min = useSharedValue(0)
  const max = useSharedValue(1)

  // While the finger is down the finger is the source of truth. Without this
  // the state update from `updateVolume` comes straight back through the effect
  // below and snaps the bar out from under it.
  const sliding = useRef(false)

  // From an effect, not the render body: Reanimated does not allow a shared
  // value to be written while rendering.
  useEffect(() => {
    if (sliding.current || volume === undefined) return
    progress.value = volume
  }, [progress, volume])

  // The level a step is measured FROM. A ref rather than the state value
  // because the repeat below runs on a timer: a callback that closed over
  // `volume` would keep stepping away from the level the finger first landed
  // on and the second tick would compute the same result as the first.
  const level = useRef(1)
  useEffect(() => {
    if (volume !== undefined) level.current = volume
  }, [volume])

  /**
   * The two speaker icons are buttons: one notch quieter, one notch louder.
   *
   * A tenth at a time, which is ten presses end to end — fine enough to land on
   * a level you meant and coarse enough that setting it is not a chore.
   *
   * Returns false at the rails, which is what stops a held press from
   * repeating into nothing.
   */
  const step = useCallback(
    (delta: number): boolean => {
      const current = level.current
      // Rounded, or repeated steps drift into 0.7000000000000001 and the
      // bar never lands cleanly on a tenth again.
      const next = Math.min(1, Math.max(0, Math.round((current + delta) * 100) / 100))
      if (next === current) return false
      level.current = next
      sliding.current = false
      void updateVolume(next)
      return true
    },
    [updateVolume],
  )

  // Press-and-hold. One notch on the way down, then — if the finger stays —
  // a run of them, which is the difference between ten deliberate taps and
  // holding the button until it sounds right.
  const holdStart = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRepeat = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopHolding = useCallback(() => {
    if (holdStart.current) {
      clearTimeout(holdStart.current)
      holdStart.current = null
    }
    if (holdRepeat.current) {
      clearInterval(holdRepeat.current)
      holdRepeat.current = null
    }
  }, [])

  const startHolding = useCallback(
    (delta: number) => {
      stopHolding()
      step(delta)
      holdStart.current = setTimeout(() => {
        holdRepeat.current = setInterval(() => {
          if (!step(delta)) stopHolding()
        }, HOLD_REPEAT_MS)
      }, HOLD_DELAY_MS)
    },
    [step, stopHolding],
  )

  // A press that ends with the component unmounting — closing the player mid
  // hold — must not leave a timer nudging the volume from nowhere.
  useEffect(() => stopHolding, [stopHolding])

  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPressIn={() => startHolding(-VOLUME_STEP)}
          onPressOut={stopHolding}
          hitSlop={12}
        >
          <Ionicons name="volume-low" size={20} color={colors.icon} style={{ opacity: 0.8 }} />
        </TouchableOpacity>

        {/* A COLUMN, not a row. On web the slider wraps itself in a plain
            <div> for its hit slop, and that div is not styled by
            react-native-web: as a flex item of a row it shrinks to its
            intrinsic width, which is nothing, and the whole volume bar
            disappeared on the desktop build. In a column the same div is
            stretched to the full width instead. */}
        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <Slider
            progress={progress}
            minimumValue={min}
            maximumValue={max}
            containerStyle={utilsStyles.slider}
            // The slider's own root defaults to 5pt tall while the track it
            // draws inside it is 7 — so the track overhung its parent by a
            // pixel at each edge.
            sliderHeight={7}
            thumbWidth={0}
            renderBubble={() => null}
            // A zero-width thumb still renders a View carrying the track's own
            // colour. Nothing should be drawn there at all.
            renderThumb={() => null}
            theme={{
              maximumTrackTintColor: colors.maximumTrackTintColor,
              minimumTrackTintColor: colors.minimumTrackTintColor,
            }}
            onSlidingStart={() => {
              sliding.current = true
            }}
            // Unlike a seek, setting the volume is instantaneous — there is
            // nothing to buffer — so it follows the finger live.
            onValueChange={(value) => {
              void updateVolume(value)
            }}
            onSlidingComplete={(value) => {
              sliding.current = false
              void updateVolume(value)
            }}
          />
        </View>

        <TouchableOpacity
          onPressIn={() => startHolding(VOLUME_STEP)}
          onPressOut={stopHolding}
          hitSlop={12}
        >
          <Ionicons name="volume-high" size={20} color={colors.icon} style={{ opacity: 0.8 }} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

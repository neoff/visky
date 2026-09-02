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

  /**
   * The two speaker icons are buttons: one notch quieter, one notch louder.
   *
   * A tenth at a time, which is ten presses end to end — fine enough to land on
   * a level you meant and coarse enough that setting it is not a chore. The
   * volume the step is measured from is the player's, not the bar's, so holding
   * the slider and pressing an icon cannot make the two disagree.
   */
  const step = useCallback(
    (delta: number) => {
      const current = volume ?? 1
      // Rounded, or repeated steps drift into 0.7000000000000001 and the
      // bar never lands cleanly on a tenth again.
      const next = Math.min(1, Math.max(0, Math.round((current + delta) * 100) / 100))
      if (next === current) return
      sliding.current = false
      void updateVolume(next)
    },
    [updateVolume, volume],
  )

  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => step(-VOLUME_STEP)} hitSlop={12}>
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

        <TouchableOpacity onPress={() => step(VOLUME_STEP)} hitSlop={12}>
          <Ionicons name="volume-high" size={20} color={colors.icon} style={{ opacity: 0.8 }} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

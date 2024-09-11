import {View, Text, ViewProps, StyleSheet} from "react-native";
import TrackPlayer, {useProgress} from "react-native-track-player";
import {useSharedValue} from "react-native-reanimated";
import {formatSecondsToMinutes} from "@/helpers/miscellaneous";
import {Slider} from "react-native-awesome-slider";
import {defaultStyles, utilsStyles} from "@/styles";
import {colors, fontSize} from "@/constants";

export const PlayerProgressBar = ({ style }: ViewProps) => {
  const { duration, position, buffered } = useProgress(250)

  const isSliding = useSharedValue(false)
  const progress = useSharedValue(0)
  const min = useSharedValue(0)
  const max = useSharedValue(1)
  const cache = useSharedValue(0)

  const trackElapsedTime = formatSecondsToMinutes(position)
  const trackRemainingTime = formatSecondsToMinutes(duration - position)

  if (!isSliding.value) {
    progress.value = duration > 0 ? position / duration : 0
    cache.value = duration > 0 ? buffered / duration : 0
  }

  return (
    <View style={style}>
      <Slider
        progress={progress}
        cache={cache}
        minimumValue={min}
        maximumValue={max}
        containerStyle={utilsStyles.slider}
        thumbWidth={0}
        renderBubble={() => null}
        theme={{
          minimumTrackTintColor: colors.minimumTrackTintColor,
          maximumTrackTintColor: colors.maximumTrackTintColor,
          cacheTrackTintColor: 'rgba(197,227,245,0.25)',
        }}

        onSlidingStart={() => (isSliding.value = true)}
        onValueChange={async (value) => {
          await TrackPlayer.seekTo(value * duration)
        }}
        onSlidingComplete={async (value) => {
          // if the user is not sliding, we should not update the position
          if (!isSliding.value) return

          isSliding.value = false

          await TrackPlayer.seekTo(value * duration)
        }}
      />

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{trackElapsedTime}</Text>

        <Text style={styles.timeText}>
          {'-'} {trackRemainingTime}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 20,
  },
  timeText: {
    ...defaultStyles.text,
    color: colors.text,
    opacity: 0.75,
    fontSize: fontSize.xs,
    letterSpacing: 0.7,
    fontWeight: '500',
  },
})

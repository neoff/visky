import {TouchableOpacity, View, ViewStyle} from "react-native";
import TrackPlayer, {useIsPlaying} from "react-native-track-player";
import {FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {colors} from "@/constants";
import {playerControlStyle} from "@/styles";

type PlayerControlsProps = {
  style?: ViewStyle
}

type PlayerButtonProps = {
  style?: ViewStyle
  iconSize?: number
}
export const PlayerControls = ({ style }: PlayerControlsProps) => {
  return (
    <View style={[playerControlStyle.container, style]}>
      <View style={playerControlStyle.row}>
        <SkipToPreviousButton />

        <PlayPauseButtonPlayer />

        <NextButton />
      </View>
    </View>
  )
}
export const PlayPauseButton = ({ style, iconSize = 48 }: PlayerButtonProps) => {
  const { playing } = useIsPlaying()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={playing ? TrackPlayer.pause : TrackPlayer.play}
      >
        <FontAwesome6 name={playing ? 'pause' : 'play'} size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}


const PlayPauseButtonPlayer = ({ style, iconSize = 78 }: PlayerButtonProps) => {
  const { playing } = useIsPlaying()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={playing ? TrackPlayer.pause : TrackPlayer.play}
      >
        <MaterialCommunityIcons name={playing ? 'pause-circle' : 'play-circle'} size={iconSize} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

export const SkipToNextButton = ({ iconSize = 30 }: PlayerButtonProps) => {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => TrackPlayer.skipToNext()}>
      <FontAwesome6 name="forward" size={iconSize} color={colors.text} />
    </TouchableOpacity>
  )
}

const NextButton = ({ iconSize = 40 }: PlayerButtonProps) => {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => TrackPlayer.skipToNext()}>
      <Ionicons name={"play-skip-forward"} size={iconSize} color={colors.text} />
    </TouchableOpacity>
  )
}

export const SkipToPreviousButton = ({ iconSize = 40 }: PlayerButtonProps) => {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => TrackPlayer.skipToPrevious()}>
      <Ionicons name={'play-skip-back'} size={iconSize} color={colors.text} />
    </TouchableOpacity>
  )
}
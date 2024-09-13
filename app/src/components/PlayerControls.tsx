import {TouchableOpacity, View, ViewStyle} from "react-native";
import TrackPlayer, {useIsPlaying} from "react-native-track-player";
import {FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {colors} from "@/constants";
import {playerControlStyle} from "@/styles";

type PlayerControlsProps = {
  style?: ViewStyle
}

export enum PlayerButtonType {
  SMALL = 'small',
  BIG = 'big',
}
type PlayerButtonProps = {
  type?: PlayerButtonType
  style?: ViewStyle
  playing?: boolean
  iconSize?: number
}
export const PlayerControls = ({ style }: PlayerControlsProps) => {
  return (
    <View style={[playerControlStyle.container, style]}>
      <View style={playerControlStyle.row}>
        <SkipToPreviousButton />

        <PlayPauseButton />

        <SkipToNextButton />
      </View>
    </View>
  )
}

const SmallPlayPauseButton = ({ playing, iconSize = 30 }: PlayerButtonProps) => {
  return (
    <FontAwesome6 name={playing ? 'pause' : 'play'} size={iconSize} color={colors.text} />
  )
}
const BigPlayPauseButton = ({ playing, iconSize = 48 }: PlayerButtonProps) => {
  return (
    <MaterialCommunityIcons name={playing ? 'pause-circle' : 'play-circle'} size={iconSize} color={colors.text} />
  )
}

export const PlayPauseButton = ({ style, type, iconSize = 78 }: PlayerButtonProps) => {
  const { playing } = useIsPlaying()

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={playing ? TrackPlayer.pause : TrackPlayer.play}
      >
        {type === PlayerButtonType.SMALL
          ? <SmallPlayPauseButton playing={playing} iconSize={iconSize} />
          : <BigPlayPauseButton playing={playing} iconSize={iconSize} />
        }
      </TouchableOpacity>
    </View>
  )
}

export const SkipToNextButton = ({ type, iconSize = 40 }: PlayerButtonProps) => {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => TrackPlayer.skipToNext()}>
      {type === PlayerButtonType.SMALL
        ? <FontAwesome6 name="forward" size={iconSize} color={colors.text} />
        : <Ionicons name={"play-skip-forward"} size={iconSize} color={colors.text} />
      }
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
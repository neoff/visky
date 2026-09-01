import {useRef} from "react";
import {TouchableOpacity, View, ViewStyle} from "react-native";
import TrackPlayer, {useIsPlaying} from "react-native-track-player";
import {FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {colors} from "@/constants";
import {useHoldToSeek} from "@/hooks/useSeekGestures";
import {playerControlStyle} from "@/styles";

// How long the finger has to stay down before it counts as scrubbing rather
// than a tap. The default (500 ms) is long enough that a deliberate hold feels
// like a stuck button.
const HOLD_MS = 280

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
  const handlePlayPause = async () => {
    try {
      if (playing) {
        await TrackPlayer.pause()
      } else {
        await TrackPlayer.play()
      }
    } catch (error) {
      console.warn('Unable to change playback state', error)
    }
  }

  return (
    <View style={[{ height: iconSize }, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePlayPause}
      >
        {type === PlayerButtonType.SMALL
          ? <SmallPlayPauseButton playing={playing} iconSize={iconSize} />
          : <BigPlayPauseButton playing={playing} iconSize={iconSize} />
        }
      </TouchableOpacity>
    </View>
  )
}

/** Tap: next track. Hold: scrub forward, 10 s at a time. */
export const SkipToNextButton = ({ type, iconSize = 40 }: PlayerButtonProps) => {
  const hold = useHoldToSeek(1)

  const handleSkipToNext = async () => {
    try {
      await TrackPlayer.skipToNext()
    } catch (error) {
      console.warn('Unable to skip to the next track', error)
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleSkipToNext}
      delayLongPress={HOLD_MS}
      {...hold}
    >
      {type === PlayerButtonType.SMALL
        ? <FontAwesome6 name="forward" size={iconSize} color={colors.text} />
        : <Ionicons name={"play-skip-forward"} size={iconSize} color={colors.text} />
      }
    </TouchableOpacity>
  )
}

// A second tap means "back", but only if it arrives while the first one is
// still the obvious context — either quickly, or while the track is still at
// the beginning because the first tap put it there.
const BACK_TAP_WINDOW_MS = 1500
const AT_START_SECONDS = 3

/**
 * Tap: restart the current track. Tap again: previous track. Hold: scrub back.
 *
 * The two rules for "again" are on purpose. The timer covers a deliberate
 * double tap; the position covers a user who restarted, listened to two
 * seconds, and pressed again meaning "no, the one before". Either alone gets
 * one of those wrong.
 */
export const SkipToPreviousButton = ({ type, iconSize = 40 }: PlayerButtonProps) => {
  const hold = useHoldToSeek(-1)
  const lastTapAt = useRef(0)

  const handlePress = async () => {
    const now = Date.now()
    const tappedAgain = now - lastTapAt.current < BACK_TAP_WINDOW_MS
    lastTapAt.current = now

    try {
      const position = await TrackPlayer.getProgress().then((progress) => progress.position)
      if (tappedAgain || position <= AT_START_SECONDS) {
        await TrackPlayer.skipToPrevious()
        return
      }
      await TrackPlayer.seekTo(0)
    } catch (error) {
      console.warn('Unable to go back', error)
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      delayLongPress={HOLD_MS}
      {...hold}
    >
      {type === PlayerButtonType.SMALL
        ? <FontAwesome6 name="backward" size={iconSize} color={colors.text} />
        : <Ionicons name={'play-skip-back'} size={iconSize} color={colors.text} />
      }
    </TouchableOpacity>
  )
}

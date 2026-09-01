import {MovingText} from "@/components/MovingText";
import {DevicePicker} from "@/components/DevicePicker";
import {StopPropagation} from "@/components/utils/StopPropagation";
import {PlayerButtonType, PlayPauseButton, SkipToNextButton} from "@/components/PlayerControls";
import {unknownTrackImageUri} from "@/constants/images";
import {useLastActiveTrack} from "@/hooks/useLastActiveTrack";
import {colors, fonts, layout} from "@/constants";
import {defaultStyles} from "@/styles";
import {useRemoteDevice} from "@/store/playback";
import {MaterialCommunityIcons} from "@expo/vector-icons";
import {useRouter} from "expo-router";
import {useState} from "react";
import {StyleSheet, Text, TouchableOpacity, View, ViewProps} from "react-native";
import FastImage from "react-native-fast-image";
import {useActiveTrack} from "react-native-track-player";

export const FloatingPlayer = ({style}: ViewProps) => {
  const router = useRouter()
  const activeTrack = useActiveTrack()
  const lastActiveTrack = useLastActiveTrack()
  const displayedTrack = activeTrack ?? lastActiveTrack
  // the device that owns the sound, when it is not this one
  const remoteDevice = useRemoteDevice()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handlePress = () => {
    router.navigate('/player')
  }

  if (!displayedTrack) return null

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={[styles.container, style]}>
      <>
        <FastImage
          source={{
            uri: displayedTrack.artwork ?? unknownTrackImageUri,
          }}
          style={styles.trackArtworkImage}
        />

        <View style={styles.trackTitleContainer}>
          <MovingText
            style={styles.trackTitle}
            text={displayedTrack.title ?? ''}
            animationThreshold={25}
          />
          {/* where the sound actually is, when it is not here */}
          {remoteDevice && (
            <Text style={styles.remoteLabel} numberOfLines={1}>
              Playing on {remoteDevice.name ?? 'another device'}
            </Text>
          )}
        </View>

        <View style={styles.trackControlsContainer}>
          {/* the picker: hand the track to another device, or take it back.
              Wrapped so the tap does not also open the full player. */}
          <StopPropagation>
            <TouchableOpacity onPress={() => setPickerOpen(true)} hitSlop={10}>
              <MaterialCommunityIcons
                name={remoteDevice ? 'cast-connected' : 'cast'}
                size={22}
                color={remoteDevice ? colors.primary : colors.icon}
              />
            </TouchableOpacity>
          </StopPropagation>
          {/* Play/pause and forward only. A back button was tried here and
              taken out again: the miniplayer is a glance and a thumb, and the
              fourth control cost the track title the width it needs more. Going
              back lives in the full player, which is one tap away. */}
          <PlayPauseButton iconSize={24} type={PlayerButtonType.SMALL}/>
          <SkipToNextButton iconSize={22} type={PlayerButtonType.SMALL}/>
        </View>

        <DevicePicker visible={pickerOpen} onClose={() => setPickerOpen(false)}/>

        <View style={styles.divider} pointerEvents="none"/>
      </>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    // same plate colour as the tab bar; it is docked on top of it, so only the
    // top corners are rounded and the bar below shows no seam.
    // The height is fixed (not derived from the padding + text line height) so
    // the plate is exactly as tall on Android as it is on iOS.
    height: layout.floatingPlayerHeight,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // Splits the docked plate into two sections (player / tab icons). Painted ON
  // the plate — never a gap, or it would punch a hole through both plates.
  // It spans the mini player's own content: from the LEFT EDGE OF THE ARTWORK to
  // the RIGHT EDGE OF THE ⏭ BUTTON. Absolute children are laid out against the
  // parent's border box, so the parent's padding has to be repeated here.
  divider: {
    position: 'absolute',
    left: 8,       // plate paddingHorizontal — the artwork starts here
    right: 8 + 16, // plate paddingHorizontal + trackControlsContainer marginRight
    bottom: 0,
    height: 2, // hairline (0.33pt on a 3x screen) was invisible
    backgroundColor: colors.surfaceDivider,
  },
  trackArtworkImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  trackTitleContainer: {
    flex: 1,
    overflow: 'hidden',
    marginLeft: 10,
  },
  trackTitle: {
    ...defaultStyles.text,
    fontSize: fonts.sm,
    lineHeight: fonts.sm + 4,
    fontWeight: '600',
    paddingLeft: 10,
  },
  // second line, only while another device is making the sound
  remoteLabel: {
    color: colors.primary,
    fontSize: fonts.xs,
    paddingLeft: 10,
  },
  trackControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 16,
    marginRight: 16,
    paddingLeft: 16,
  },
})

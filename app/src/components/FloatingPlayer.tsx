import {MovingText} from "@/components/MovingText";
import {PlayerButtonType, PlayPauseButton, SkipToNextButton} from "@/components/PlayerControls";
import {unknownTrackImageUri} from "@/constants/images";
import {useLastActiveTrack} from "@/hooks/useLastActiveTrack";
import {colors, fonts, layout} from "@/constants";
import {defaultStyles} from "@/styles";
import {useRouter} from "expo-router";
import {StyleSheet, TouchableOpacity, View, ViewProps} from "react-native";
import FastImage from "react-native-fast-image";
import {useActiveTrack} from "react-native-track-player";

export const FloatingPlayer = ({style}: ViewProps) => {
  const router = useRouter()
  const activeTrack = useActiveTrack()
  const lastActiveTrack = useLastActiveTrack()
  const displayedTrack = activeTrack ?? lastActiveTrack

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
        </View>

        <View style={styles.trackControlsContainer}>
          <PlayPauseButton iconSize={24} type={PlayerButtonType.SMALL}/>
          <SkipToNextButton iconSize={22} type={PlayerButtonType.SMALL}/>
        </View>

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
  // Inset on the left exactly like the list separator: it starts where the
  // track title starts, not at the screen edge.
  divider: {
    position: 'absolute',
    left: 8 + 40 + 10, // plate padding + artwork + title container margin
    right: 8,          // plate padding
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
  trackControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 20,
    marginRight: 16,
    paddingLeft: 16,
  },
})

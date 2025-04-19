import {MovingText} from "@/components/MovingText";
import {FavoritesButton, PlayerButtonType, PlayPauseButton, SkipToNextButton} from "@/components/PlayerControls";
import {unknownTrackImageUri} from "@/constants/images";
import {useLastActiveTrack} from "@/hooks/useLastActiveTrack";
import {defaultStyles} from "@/styles";
import {useRouter} from "expo-router";
import {StyleSheet, TouchableOpacity, View, ViewProps} from "react-native";
import FastImage from "react-native-fast-image";
import {useActiveTrack} from "react-native-track-player";
import {modifiers} from "@/constants";
import {FontAwesome} from "@expo/vector-icons";
import React from "react";

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
          <FavoritesButton iconSize={24 + modifiers.icons} type={PlayerButtonType.SMALL}/>
          <PlayPauseButton iconSize={24 + modifiers.icons} type={PlayerButtonType.SMALL}/>
          <SkipToNextButton iconSize={22 + modifiers.icons} type={PlayerButtonType.SMALL}/>
        </View>
      </>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    padding: 8,
    borderRadius: 12,
    paddingVertical: 10 + modifiers.padding,
  },
  trackArtworkImage: {
    width: 40 + modifiers.icons + modifiers.width,
    height: 40 + modifiers.icons + modifiers.height,
    borderRadius: 8,
  },
  trackTitleContainer: {
    flex: 1,
    overflow: 'hidden',
    marginLeft: 10,
  },
  trackTitle: {
    ...defaultStyles.text,
    fontSize: 18 + modifiers.text,
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
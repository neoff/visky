import {MovingText} from "@/components/MovingText";
import {PlayerControls} from "@/components/PlayerControls";
import {colors, fontSize, screenPadding} from "@/constants";
import {unknownTrackImageUri} from "@/constants/images";
import {defaultStyles, utilsStyles} from "@/styles";
import {Entypo, FontAwesome, MaterialCommunityIcons, MaterialIcons, Octicons} from "@expo/vector-icons";
import {LinearGradient} from "expo-linear-gradient";
import {ActivityIndicator, StyleSheet, Text, View} from "react-native";
import FastImage from "react-native-fast-image";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useActiveTrack} from "react-native-track-player";
import {PlayerProgressBar} from "@/components/PlayerProgressbar";
import {PlayerVolumeBar} from "@/components/PlayerVolumeBar";
import {PlayerRepeatToggle} from "@/components/PlayerRepeatToggle";
//import {usePlayerBackground} from "@/hooks/usePlayerBackground";
import PlayerEqualizerBar from "@/components/PlayerEqualizerBar";
import PlayerTrackListBar from "@/components/PlayerTrackListBar";
import React from "react";
import {router} from "expo-router";
import PlayerEditInfoBar from "@/components/PlayerEditInfoBar";

const PlayerScreen = () => {
  const activeTrack = useActiveTrack()
  //const {imageColors} = usePlayerBackground(activeTrack?.artwork ?? unknownTrackImageUri)

  const {top, bottom} = useSafeAreaInsets()

  //temp fix
  const isFavorite = false
  const toggleFavorite = () => {
  }
  //const { isFavorite, toggleFavorite } = useTrackPlayerFavorite()

  const isHidedSong = false
  const toggleHideSong = () => {
  }

  if (!activeTrack) {
    return (
      <View style={[defaultStyles.container, {justifyContent: 'center'}]}>
        <ActivityIndicator color={colors.icon}/>
      </View>
    )
  }
  //const [background, primary] = !imageColors ? [colors.background, colors.primary] : imageColors.platform === 'ios' ? [imageColors.background, imageColors.primary] : [imageColors.dominant, imageColors.vibrant]
  const [background, primary] = [colors.background, colors.primary]
  const handleClosePlayer = () => {
    router.dismiss()
  }
  return (
    <LinearGradient
      style={{flex: 1}}
      colors={[background, primary]}
    >
      <View style={styles.overlayContainer}>
        <DismissPlayerSymbol handleClick={handleClosePlayer}/>

        <View style={{flex: 1, marginTop: top + 70, marginBottom: bottom}}>
          <View style={styles.artworkImageContainer}>
            <FastImage
              source={{
                uri: activeTrack.artwork ?? unknownTrackImageUri,
                priority: FastImage.priority.high,
              }}
              resizeMode="cover"
              style={styles.artworkImage}
            />
          </View>

          <View style={{flex: 1}}>
            <View style={{marginTop: 'auto'}}>
              <View style={{height: 60}}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {/* Track title */}
                  <View style={styles.trackTitleContainer}>
                    <MovingText
                      text={activeTrack.title ?? ''}
                      animationThreshold={30}
                      style={styles.trackTitleText}
                    />
                  </View>
                  {/* Hide button icon */}
                  <MaterialCommunityIcons
                    name={isHidedSong ? 'eye-off' : 'eye-off-outline'}
                    size={23}
                    color={isFavorite ? colors.primary : colors.icon}
                    style={{marginLeft: 14}}
                    onPress={toggleHideSong}
                  />
                  {/* Favorite button icon */}
                  <FontAwesome
                    name={isFavorite ? 'heart' : 'heart-o'}
                    size={20}
                    color={isFavorite ? colors.primary : colors.icon}
                    style={{marginHorizontal: 7}}
                    onPress={toggleFavorite}
                  />
                </View>

                {/* Track artist */}
                {activeTrack.artist && (
                  <Text numberOfLines={1} style={[styles.trackArtistText, {marginTop: 6}]}>
                    {activeTrack.artist}
                  </Text>
                )}
              </View>

              <PlayerProgressBar style={{marginTop: 32}}/>

              <PlayerControls style={{marginTop: 10}}/>
            </View>

            <PlayerVolumeBar style={{marginTop: 'auto', marginBottom: 30}}/>

            <View style={utilsStyles.centeredRow}>
              <View
                style={{
                  position: 'relative',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <PlayerTrackListBar size={37} />
                <MaterialIcons name="edit-note" size={28} color={colors.icon} />
                <PlayerRepeatToggle size={30} style={{marginBottom: 6, marginHorizontal: 10}}/>
                <PlayerEqualizerBar size={25} style={{marginBottom: 6, marginTop: 3}}/>
                <Entypo name="share-alternative" size={24} color={colors.icon} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  )
}

const DismissPlayerSymbol = ({handleClick}: { handleClick?: () => void }) => {
  const {top, left, right} = useSafeAreaInsets()

  return (
    <View
      style={{
        position: 'absolute',
        top: top + 8,
        left: left,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}
    >
      <Octicons name="chevron-down" size={28} color={colors.icon} onPress={handleClick}
                style={{
                  marginHorizontal: 5,
                  paddingLeft: left + 20,
                  marginTop: -11
                }}/>
      <View
        accessible={false}
        style={{
          width: 50,
          height: 8,
          borderRadius: 8,
          backgroundColor: '#fff',
          opacity: 0.7,
        }}
      />

      <PlayerEditInfoBar style={{paddingRight: 20, marginTop: -11}}/>
    </View>
  )
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...defaultStyles.container,
    paddingHorizontal: screenPadding.horizontal,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  artworkImageContainer: {
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 11.0,
    flexDirection: 'row',
    justifyContent: 'center',
    height: '45%',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    borderRadius: 12,
  },
  trackTitleContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: 22,
    fontWeight: '700',
  },
  trackArtistText: {
    ...defaultStyles.text,
    fontSize: fontSize.base,
    opacity: 0.8,
    maxWidth: '90%',
  },
})
export default PlayerScreen
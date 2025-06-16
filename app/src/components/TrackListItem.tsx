import {unknownTrackImageUri} from "@/constants/images"
import {colors, fonts, modifiers} from "@/constants"
import {defaultStyles} from "@/styles"
import {StyleSheet, Text, TouchableHighlight, View} from "react-native"
import FastImage from "react-native-fast-image"
import LoaderKit from 'react-native-loader-kit'
import {Track, useActiveTrack, useIsPlaying} from "react-native-track-player";
import {Entypo, Ionicons} from "@expo/vector-icons";
import dayjs from "dayjs";

export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
}

export const TrackListItem = ({
                                track,
                                onTrackSelect: handleTrackSelect,
                              }: TracksListItemProps) => {
  const {playing} = useIsPlaying()
  const isActiveTrack = useActiveTrack()?.url === track.url

  return (
    <TouchableHighlight onPress={() => handleTrackSelect(track)}>
      <View style={styles.trackItemContainer}>
        <View>
          <FastImage
            source={{
              uri: track.artwork ?? unknownTrackImageUri,
              priority: FastImage.priority.normal,
            }}
            style={{
              ...styles.trackArtworkImage,
              opacity: !track.url ? 0.4 : isActiveTrack ? 0.6 : 1,
            }}
          />

          {isActiveTrack &&
            (playing ? (
              <LoaderKit
                style={styles.trackPlayingIconIndicator}
                name="LineScaleParty"
                color={colors.icon}
              />
            ) : (
              <Ionicons
                style={styles.trackPausedIndicator}
                name="play"
                size={24 + modifiers.icons}
                color={colors.icon}
              />
            ))}
        </View>

        <View style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {/* Track title + artist */}
          <View style={{width: '100%'}}>
            <Text numberOfLines={1} style={{
              ...styles.trackTitleText,
              color: !track.url ? colors.textMuted : isActiveTrack ? colors.primary : colors.text,
              textDecorationLine: !track.url ? 'line-through' : 'none',
            }}>
              {track.title}
            </Text>

            <View style={{
              flex: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              {track.artist && (
                <Text numberOfLines={1} style={{
                  ...styles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                }}>
                  {track.artist}
                </Text>
              )}
              <View style={{alignItems: 'flex-end'}}>
                <Text numberOfLines={1} style={{
                  ...styles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                }}>
                  {dayjs.unix(Number(track.date)).format('DD.MM.YYYY')}
                </Text>
              </View>
            </View>
          </View>
          <Entypo name="dots-three-horizontal" size={18} color={colors.icon}/>
        </View>
      </View>
    </TouchableHighlight>
  )
};

const styles = StyleSheet.create({
  trackItemContainer: {
    flexDirection: 'row',
    columnGap: 14 + modifiers.padding,
    alignItems: 'center',
    paddingRight: 20 + modifiers.padding,
  },
  trackPlayingIconIndicator: {
    position: 'absolute',
    top: 18 + modifiers.top,
    left: 28 + modifiers.left,
    width: 16 + modifiers.width,
    height: 16 + modifiers.height,
  },
  trackPausedIndicator: {
    position: 'absolute',
    top: 14 + modifiers.top,
    left: 24 + modifiers.left,
  },
  trackArtworkImage: {
    borderRadius: 8,
    marginLeft: 10 + modifiers.padding,
    width: 50 + modifiers.image,
    height: 50 + modifiers.image,
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: fonts.sm,
    fontWeight: '600',
    maxWidth: '90%',
  },
  trackArtistText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    fontSize: 14 + modifiers.text,
    marginTop: 4 + modifiers.padding,
  },
})

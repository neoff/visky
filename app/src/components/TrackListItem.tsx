import {unknownTrackImageUri} from "@/constants/images"
import {colors} from "@/constants"
import {trackListStyles} from "@/styles"
import {ActivityIndicator, Text, TouchableHighlight, View} from "react-native"
import FastImage from "react-native-fast-image"
import {Track, useActiveTrack, useIsPlaying} from "react-native-track-player";
import {Entypo, Ionicons} from "@expo/vector-icons";
import dayjs from "dayjs";
import {isSameTrack} from "@/helpers/miscellaneous";

export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
}

export const TrackListItem = ({
                                track,
                                onTrackSelect: handleTrackSelect,
                              }: TracksListItemProps) => {
  const {playing} = useIsPlaying()
  // by id, not by url — VK's signed urls change on every refresh
  const isActiveTrack = isSameTrack(useActiveTrack(), track)

  return (
    <TouchableHighlight onPress={() => handleTrackSelect(track)}>
      <View style={trackListStyles.trackItemContainer}>
        <View style={trackListStyles.trackArtworkContainer}>
          <FastImage
            source={{
              uri: track.artwork ?? unknownTrackImageUri,
              priority: FastImage.priority.normal,
            }}
            style={{
              ...trackListStyles.trackArtworkImage,
              opacity: !track.url ? 0.4 : isActiveTrack ? 0.6 : 1,
            }}
          />

          {isActiveTrack && (
            <View style={trackListStyles.trackArtworkOverlay} pointerEvents="none">
              {playing ? (
                <ActivityIndicator color={colors.icon} size="small"/>
              ) : (
                <Ionicons name="play" size={24} color={colors.icon}/>
              )}
            </View>
          )}
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
              ...trackListStyles.trackTitleText,
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
                  ...trackListStyles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                }}>
                  {track.artist}
                </Text>
              )}
              <View style={{alignItems: 'flex-end'}}>
                <Text numberOfLines={1} style={{
                  ...trackListStyles.trackArtistText,
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
}

import {unknownTrackImageUri} from "@/constants/images"
import {colors} from "@/constants"
import {trackListStyles} from "@/styles"
import {ActivityIndicator, Text, TouchableHighlight, TouchableOpacity, View} from "react-native"
import FastImage from "react-native-fast-image"
import {Track, useActiveTrack, useIsPlaying} from "react-native-track-player";
import {Entypo, FontAwesome, Ionicons} from "@expo/vector-icons";
import dayjs from "dayjs";
import {isSameTrack} from "@/helpers/miscellaneous";
import {useIsFavorite, useToggleFavorite} from "@/store/favorites";
import {useIsPlayed} from "@/store/played";

export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
}

export const TrackListItem = ({
                                track,
                                onTrackSelect: handleTrackSelect,
                              }: TracksListItemProps) => {
  const {playing, bufferingDuringPlay} = useIsPlaying()
  // by id, not by url — VK's signed urls change on every refresh
  const isActiveTrack = isSameTrack(useActiveTrack(), track)
  const isFavorite = useIsFavorite(track)
  const toggleFavorite = useToggleFavorite()
  // a show runs an hour and the list is an archive, so "already heard" is worth
  // seeing at a glance
  const isPlayed = useIsPlayed(track)

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
              {/* the spinner means BUFFERING, not "playing": a playing track
                  shows the pause glyph, a paused one shows play */}
              {bufferingDuringPlay ? (
                <ActivityIndicator color={colors.icon} size="small"/>
              ) : (
                <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.icon}/>
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
          <View style={{flex: 1, minWidth: 0}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              {isPlayed && !isActiveTrack && (
                <Ionicons name="checkmark-circle" size={14} color={colors.textMutedDarker}/>
              )}
              <Text numberOfLines={1} style={{
                ...trackListStyles.trackTitleText,
                color: !track.url
                  ? colors.textMuted
                  : isActiveTrack
                    ? colors.primary
                    : isPlayed ? colors.textMuted : colors.text,
                textDecorationLine: !track.url ? 'line-through' : 'none',
                flexShrink: 1,
              }}>
                {track.title}
              </Text>
            </View>

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
          {/* Favorite toggle — the heart is what the Favorites tab is built from */}
          <TouchableOpacity
            onPress={() => toggleFavorite(track)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            style={{paddingHorizontal: 10}}
          >
            <FontAwesome
              name={isFavorite ? 'heart' : 'heart-o'}
              size={16}
              color={isFavorite ? colors.primary : colors.icon}
            />
          </TouchableOpacity>

          <Entypo name="dots-three-horizontal" size={18} color={colors.icon}/>
        </View>
      </View>
    </TouchableHighlight>
  )
}

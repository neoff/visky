import { colors, fonts, modifiers } from "@/constants";
import { unknownTrackImageUri } from "@/constants/images";
import { addToFavorites, removeFromFavorites } from "@/helpers/network";
import { defaultStyles } from "@/styles";
import { Entypo, Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import dayjs from "dayjs";
import { Image } from 'expo-image';
import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, TouchableHighlight, View } from "react-native";
import LoaderKit from 'react-native-loader-kit';
import { Track, useActiveTrack, useIsPlaying } from "react-native-track-player";

export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
  isFavoritesScreen?: boolean
  onFavoriteToggle?: (track: Track, isFavorite: boolean) => void
}

export const TrackListItem = ({
                                track,
                                onTrackSelect: handleTrackSelect,
                                isFavoritesScreen = false,
                                onFavoriteToggle,
                              }: TracksListItemProps) => {
  const {playing} = useIsPlaying()
  const isActiveTrack = useActiveTrack()?.url === track.url
  const [isFavorite, setIsFavorite] = useState(track.favorite ?? false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)

  const handleFavoritePress = async () => {
    if (isTogglingFavorite) return
    
    setIsTogglingFavorite(true)
    try {
      if (isFavorite || isFavoritesScreen) {
        // Remove from favorites
        await removeFromFavorites(track.id, track.owner_id)
        setIsFavorite(false)
        onFavoriteToggle?.(track, false)
      } else {
        // Add to favorites
        await addToFavorites(track.id, track.owner_id)
        setIsFavorite(true)
        onFavoriteToggle?.(track, true)
      }
    } catch (error) {
      const axiosError = error as AxiosError
      console.error('Favorite toggle error:', axiosError)
      
      if (axiosError.status === 404) {
        // Playlist doesn't exist
        Alert.alert(
          'Favorites Playlist Not Found',
          'You need to create the Frisky Favorites playlist first. Would you like to go to Settings?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Go to Settings', 
              onPress: () => router.push('/(app)/(tabs)/settings')
            }
          ]
        )
      } else {
        const errorMessage = (axiosError.response?.data as { message?: string })?.message || axiosError.message
        Alert.alert('Error', errorMessage)
      }
    } finally {
      setIsTogglingFavorite(false)
    }
  }

  return (
    <TouchableHighlight onPress={() => handleTrackSelect(track)}>
      <View style={styles.trackItemContainer}>
        <View>
          <Image
            source={track.artwork ?? unknownTrackImageUri}
            style={{
              ...styles.trackArtworkImage,
              opacity: !track.url ? 0.4 : isActiveTrack ? 0.6 : 1,
            }}
            contentFit="cover"
            transition={100}
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
          <View style={{flex: 1, paddingRight: 8}}>
            <Text numberOfLines={1} style={{
              ...styles.trackTitleText,
              color: !track.url ? colors.textMuted : isActiveTrack ? colors.primary : colors.text,
              textDecorationLine: !track.url ? 'line-through' : 'none',
            }}>
              {track.title}
            </Text>

            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              {track.artist && (
                <Text numberOfLines={1} style={{
                  ...styles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                  flex: 1,
                }}>
                  {track.artist}
                </Text>
              )}
              <Text style={{
                ...styles.trackArtistText,
                color: !track.url ? colors.textMutedDarker : colors.textMuted,
                marginLeft: 8,
              }}>
                {dayjs.unix(Number(track.date)).format('DD.MM.YYYY')}
              </Text>
            </View>
          </View>
          <View style={styles.actionsContainer}>
            <TouchableHighlight 
              onPress={handleFavoritePress}
              disabled={isTogglingFavorite}
              style={styles.favoriteButton}
            >
              <Ionicons 
                name={isFavorite || isFavoritesScreen ? "heart" : "heart-outline"} 
                size={22} 
                color={isFavorite || isFavoritesScreen ? colors.primary : colors.icon}
              />
            </TouchableHighlight>
            <Entypo name="dots-three-horizontal" size={18} color={colors.icon}/>
          </View>
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
    paddingHorizontal: 16 + modifiers.padding,
  },
  trackPlayingIconIndicator: {
    position: 'absolute',
    top: 18 + modifiers.top,
    left: 18 + modifiers.left,
    width: 16 + modifiers.width,
    height: 16 + modifiers.height,
  },
  trackPausedIndicator: {
    position: 'absolute',
    top: 14 + modifiers.top,
    left: 14 + modifiers.left,
  },
  trackArtworkImage: {
    borderRadius: 8,
    width: 50 + modifiers.image,
    height: 50 + modifiers.image,
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: fonts.sm,
    fontWeight: '600',
    maxWidth: '100%',
  },
  trackArtistText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    fontSize: 14 + modifiers.text,
    marginTop: 4 + modifiers.padding,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  favoriteButton: {
    padding: 4,
  },
})

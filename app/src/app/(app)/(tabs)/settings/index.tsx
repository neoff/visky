import { useSession } from "@/components/SessionProvider";
import { apiUrls } from "@/constants";
import { createFavoritesPlaylist, getFavoritesData, refreshFavoritesPlaylist } from "@/helpers/network";
import { storage } from "@/store/library";
import { iconStyles, welcomeStyles } from "@/styles";
import { AxiosError } from "axios";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Text, View } from "react-native";
import TrackPlayer from "react-native-track-player";
import Icon from "react-native-vector-icons/FontAwesome";


const SettingsScreen = (
  state: {
    user: {
      name: string;
      username: string;
      avatar: string
    } | undefined
  }
) => {
  const {signOut} = useSession();
  const [hasPlaylist, setHasPlaylist] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingPlaylist, setIsCheckingPlaylist] = useState(true)

  const check = async () => {
    try {
      // Stop playback
      await TrackPlayer.reset();
      
      // Clear all MMKV storage
      await storage.clearStore();
      
      // Clear session (auth_url and session keys in SecureStore/localStorage)
      signOut();
      
      // Navigate to welcome screen
      router.replace('/');
      
      console.log("===All local data cleared");
    } catch (error) {
      console.error("Error clearing data:", error);
      // Still try to logout even if clearing fails
      signOut();
      router.replace('/');
    }
  }

  const checkPlaylistExists = async () => {
    try {
      await getFavoritesData(undefined, undefined, 0)
      setHasPlaylist(true)
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.status === 404) {
        setHasPlaylist(false)
      }
    } finally {
      setIsCheckingPlaylist(false)
    }
  }

  useEffect(() => {
    checkPlaylistExists()
  }, [])

  const handleCreatePlaylist = async () => {
    setIsLoading(true)
    try {
      const result = await createFavoritesPlaylist()
      Alert.alert(
        'Success',
        `Favorites playlist created! ${result.tracksAdded || 0} tracks added from ${result.totalFriskyTracks || 0} Frisky tracks in your favorites.`,
        [{ text: 'OK', onPress: () => {
          setHasPlaylist(true)
          router.push('/(app)/(tabs)/favorites')
        }}]
      )
    } catch (error) {
      const axiosError = error as AxiosError
      console.error('Create playlist error:', axiosError)
      
      if (axiosError.status === 409) {
        setHasPlaylist(true)
        Alert.alert('Info', 'Favorites playlist already exists. Use Refresh instead.')
      } else {
        const errorMessage = (axiosError.response?.data as { message?: string })?.message || axiosError.message
        Alert.alert('Error', errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefreshPlaylist = async () => {
    setIsLoading(true)
    try {
      const result = await refreshFavoritesPlaylist()
      Alert.alert(
        'Success',
        `Favorites playlist refreshed! Deleted ${result.deletedTracks || 0} old tracks, added ${result.tracksAdded || 0} new tracks from ${result.totalFriskyTracks || 0} Frisky tracks.`,
        [{ text: 'OK' }]
      )
    } catch (error) {
      const axiosError = error as AxiosError
      console.error('Refresh playlist error:', axiosError)
      
      if (axiosError.status === 404) {
        setHasPlaylist(false)
        Alert.alert('Error', 'Favorites playlist not found. Please create it first.')
      } else {
        const errorMessage = (axiosError.response?.data as { message?: string })?.message || axiosError.message
        Alert.alert('Error', errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.content}>
        <Text style={welcomeStyles.header}>
          Welcome, {state.user?.name}!{'\n\n'}or should we call{'\n'}you {state.user?.username}?
        </Text>
        
        {isCheckingPlaylist ? (
          <ActivityIndicator size="small" color="white" style={{marginVertical: 10}} />
        ) : (
          <>
            {hasPlaylist ? (
              <Icon.Button
                name="refresh"
                backgroundColor="rgba(255,255,255,.09)"
                onPress={handleRefreshPlaylist}
                disabled={isLoading}
                {...iconStyles}>
                {isLoading ? 'Refreshing...' : 'Refresh Favorites Playlist'}
              </Icon.Button>
            ) : (
              <Icon.Button
                name="heart"
                backgroundColor="rgba(255,68,68,.2)"
                onPress={handleCreatePlaylist}
                disabled={isLoading}
                {...iconStyles}>
                {isLoading ? 'Creating...' : 'Create Favorites Playlist'}
              </Icon.Button>
            )}
          </>
        )}

        <Icon.Button
          name="sign-out"
          backgroundColor="rgba(255,255,255,.09)"
          onPress={check}
          {...iconStyles} >
          Logout
        </Icon.Button>
        
        <View style={welcomeStyles.avatar}>
          <Image source={{uri: state.user?.avatar}} style={welcomeStyles.avatarImage}/>
        </View>

        <Text style={welcomeStyles.text}>
          App url, {apiUrls.baseUrl}
        </Text>
      </View>
    </View>
  )
}
export default SettingsScreen
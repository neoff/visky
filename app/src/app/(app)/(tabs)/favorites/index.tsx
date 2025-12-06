import { AnimatedSearchHeader } from "@/components/AnimatedSearchHeader";
import { TrackList } from "@/components/TrackList";
import { modifiers } from "@/constants";
import { trackTitleFilter } from "@/helpers/filter";
import { generateTracksListId } from "@/helpers/miscellaneous";
import { getFavoritesData } from "@/helpers/network";
import { useSearchStore } from "@/hooks/useSearchStore";
import { storage } from "@/store/library";
import { defaultStyles } from "@/styles";
import { AxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, StatusBar, View } from "react-native";
import { useMMKVStorage } from "react-native-mmkv-storage";
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Track } from "react-native-track-player";

const FavoriteScreen = () => {
    const { top } = (() => {
        const insets = useSafeAreaInsets()
        return { top: insets.top + modifiers.safe }
    })()
    
    const [refreshing, setRefreshing] = useState(false);
    const [cachedTrack, setCachedTrack] = useMMKVStorage<Track[]>('favorites', storage, []);
    const [tracks, setTracks] = useState<Track[]>(cachedTrack);

    const mergeTracks = async (data: any) => {
        console.debug(`Merging favorites ${data?.length} with ${tracks?.length}`)
        // Server data is source of truth, but preserve any local additions that might not be synced yet
        setCachedTrack(data)
        setTracks(data);
        return data;
    }

    const loadError = (error: AxiosError) => {
        console.log('Load favorites error:', error)
        
        if (error.status === 404) {
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
            const errorMessage = (error.response?.data as { message?: string })?.message || error.message
            Alert.alert('Error', errorMessage)
        }
    }

    const handleRefresh = () => {
        console.log('refreshing favorites')
        setRefreshing(true)
        getFavoritesData(mergeTracks, loadError).finally(() => setRefreshing(false))
    }

    const handleFavoriteToggle = (track: Track, isFavorite: boolean) => {
        if (isFavorite) {
            // Add to top of favorites list
            const trackExists = tracks.some(t => t.id === track.id && t.owner_id === track.owner_id)
            if (!trackExists) {
                const updatedTracks = [track, ...tracks]
                setTracks(updatedTracks)
                setCachedTrack(updatedTracks)
            }
        } else {
            // Remove from favorites list
            const updatedTracks = tracks.filter(t => t.id !== track.id || t.owner_id !== track.owner_id)
            setTracks(updatedTracks)
            setCachedTrack(updatedTracks)
        }
    }

    const query = useSearchStore((s) => s.query)
    const filteredFavoritesTracks: Track[] = useMemo(() => {
        if (!query) return tracks
        return tracks.filter(trackTitleFilter(query.toLowerCase()))
    }, [query, tracks])

    useEffect(() => {
        if(!tracks.length)
            handleRefresh();
    }, []);

    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });
    const HEADER_HEIGHT = top + 110 + modifiers.scroll;

    return <View style={defaultStyles.container}>
        <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>
        <AnimatedSearchHeader
            title="Favorites"
            placeholder="Find in favorites"
            onSearchChange={(text) => useSearchStore.getState().setQuery(text)}
            scrollY={scrollY}
        />
        <Animated.ScrollView
            ref={scrollRef}
            onScroll={scrollHandler}
            scrollEventThrottle={1}
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: 'transparent' }}
            contentContainerStyle={{ paddingTop: HEADER_HEIGHT, minHeight: '100%' }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor="white"
                    progressViewOffset={HEADER_HEIGHT}
                    colors={['white']}
                />
            }
        >
            <TrackList
              id={generateTracksListId('favorites', tracks.length, query)}
              tracks={filteredFavoritesTracks}
              scrollEnabled={false}
              isFavoritesScreen={true}
              onFavoriteToggle={handleFavoriteToggle}
            />
        </Animated.ScrollView>
    </View>
}
export default FavoriteScreen;
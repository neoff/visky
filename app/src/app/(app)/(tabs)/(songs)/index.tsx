import {TrackList} from "@/components/TrackList"
import {layout, screenPadding} from "@/constants"
import {generateTracksListId} from '@/helpers/miscellaneous'
import {fetchFriskyPage, searchFriskyList} from "@/helpers/network"
import {defaultStyles} from '@/styles'
import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, StatusBar, View} from 'react-native'
import {Track} from 'react-native-track-player'
import {useSharedValue} from "react-native-reanimated";
import {AnimatedSearchHeader} from "@/components/AnimatedSearchHeader";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useFavoritesStore} from "@/store/favorites";
import {useDebouncedValue} from "@/hooks/useDebouncedValue";
import {useFocusEffect} from "expo-router";
import {useWindowedTracks} from "@/hooks/useWindowedTracks";

import {SONGS_CACHE_KEY} from "@/store/library";


const SongsScreen = () => {
  const insets = useSafeAreaInsets()

  // A sliding window over the group's archive instead of one fixed page of 100:
  // scrolling to the end pulls the next page in and drops the oldest one, and
  // scrolling back up does the reverse. See useWindowedTracks.
  //
  // The first page is mirrored to MMKV, so a cold start paints the last known
  // list right away instead of an empty screen waiting on the network.
  const {tracks, refreshing, loadingMore, reset, loadMore, loadPrevious} =
    useWindowedTracks(
      useCallback((offset: number, count: number) => fetchFriskyPage(offset, count), []),
      true,
      SONGS_CACHE_KEY,
    )

  // Search runs on the SERVER, over the whole Frisky group: VK has no
  // "search inside this owner", so the API keeps the group's catalogue and
  // filters it there. Filtering the loaded page locally — which is what this
  // screen used to do — could only ever find what was already on screen.
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 400)
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const term = debouncedQuery.trim()
    if (term.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    searchFriskyList(term)
      .then((items) => {
        if (!cancelled) setSearchResults(items as Track[])
      })
      .catch((error) => console.warn('Search failed', error))
      .finally(() => {
        if (!cancelled) setSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const isSearching = debouncedQuery.trim().length >= 2
  const visibleTracks: Track[] = isSearching ? searchResults : tracks

  const scrollY = useSharedValue(0);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, [scrollY]);
  // the header is pinned under the status bar, so its height is the shared
  // content height plus the real top inset — identical on iOS and Android
  const HEADER_HEIGHT = layout.headerContentHeight + insets.top;

  // the API stamps each track with `favorite`; hand that to the store so the
  // player's heart is right even for a track that reached it through the queue
  const applyServerFlags = useFavoritesStore((state) => state.applyServerFlags)
  useEffect(() => {
    applyServerFlags(tracks as any)
  }, [tracks, applyServerFlags]);

  // hearts here always mean the Frisky playlist, whatever the Favorites tab was
  // last showing
  const setScope = useFavoritesStore((state) => state.setScope)
  useFocusEffect(
    useCallback(() => {
      setScope(undefined)
    }, [setScope])
  );

  return (
    <View style={{...defaultStyles.container}}>
      <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>
      <AnimatedSearchHeader
        title="Songs"
        placeholder="Find in songs"
        onSearchChange={setQuery}
        scrollY={scrollY}
      />
      <TrackList
        id={generateTracksListId(isSearching ? 'songs-search' : 'songs', visibleTracks.length, debouncedQuery)}
        tracks={visibleTracks}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // we pad the list manually by HEADER_HEIGHT; letting iOS add its own
        // content inset on top of that is what shifted the two platforms apart
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT,
          paddingBottom: layout.tabBarContentHeight + 80,
          paddingHorizontal: screenPadding.horizontal,
        }}
        // paging is off while a search is on screen: those results are a whole
        // answer, not a window into the archive
        onEndReached={isSearching ? undefined : loadMore}
        onEndReachedThreshold={0.6}
        onStartReached={isSearching ? undefined : loadPrevious}
        onStartReachedThreshold={0.4}
        ListFooterComponent={
          (searching || loadingMore)
            ? <ActivityIndicator color="white" style={{marginVertical: 16}}/>
            : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reset}
            tintColor="white"
            progressViewOffset={HEADER_HEIGHT}
            colors={['white']}/>
        }
      />
    </View>
  )
}

export default SongsScreen

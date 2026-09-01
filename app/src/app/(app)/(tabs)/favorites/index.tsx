import {defaultStyles} from "@/styles"
import {ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, StatusBar, StyleSheet, Text, View} from "react-native"
import {colors, fonts, layout, screenPadding} from "@/constants";
import {TrackList, TrackListSection} from "@/components/TrackList";
import {generateTracksListId} from "@/helpers/miscellaneous";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Track} from "react-native-track-player";
import {fetchFavoritesPage, searchFavorites} from "@/helpers/network";
import {useDebouncedValue} from "@/hooks/useDebouncedValue";
import {useFocusEffect, useNavigation} from "expo-router";
import {useFavoritesStore} from "@/store/favorites";
import {useSharedValue} from "react-native-reanimated";
import {AnimatedSearchHeader} from "@/components/AnimatedSearchHeader";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {FRISKY_SELECTION, PlaylistFilter, PlaylistSelection, selectionQuery} from "@/components/PlaylistFilter";
import {useWindowedTracks} from "@/hooks/useWindowedTracks";

const SUGGESTED: TrackListSection = {__section: 'Suggested for you'}

import {FAVORITES_CACHE_KEY} from "@/store/library";

const FavoriteScreen = () => {
    const insets = useSafeAreaInsets()
    const [query, setQuery] = useState('')
    // which list is on screen; the picker sets it, entering the tab resets it
    const [selection, setSelection] = useState<PlaylistSelection>(FRISKY_SELECTION)
    const selectionRef = useRef<PlaylistSelection>(FRISKY_SELECTION)

    // the same sliding window as the Songs tab: a playlist can be thousands of
    // tracks long, and "All" is the user's whole library
    const loadPage = useCallback(
      (offset: number, count: number) => fetchFavoritesPage(selectionQuery(selectionRef.current), offset, count),
      [],
    )
    // Only the Frisky list is cached: it is what the tab opens on, and the other
    // playlists must not end up in the cache that seeds the next cold start.
    const cacheKey = selection.kind === 'frisky' ? FAVORITES_CACHE_KEY : undefined
    const {tracks, refreshing, loadingMore, reset, loadMore, loadPrevious} =
      useWindowedTracks(loadPage, true, cacheKey)

    const pickSelection = useCallback((next: PlaylistSelection) => {
        selectionRef.current = next;
        setSelection(next);
        setQuery('');
        reset();
    }, [reset])

    // hearts are toggled on the Songs tab and in the player, so re-read the
    // CURRENT list every time this tab comes back into view
    useFocusEffect(
      useCallback(() => {
          reset();
      }, [reset])
    );

    // The filter resets when the tab is entered, not on every focus: opening and
    // closing the player also refocuses this screen, and coming back from a
    // track should leave the list you were looking at alone.
    const navigation = useNavigation()
    useEffect(() => {
        const resetFilter = () => {
            selectionRef.current = FRISKY_SELECTION;
            setSelection(FRISKY_SELECTION);
            setQuery('');
            reset();
        }
        // this screen sits inside its own Stack, so `tabPress` is emitted to the
        // PARENT (the tab navigator), not here — listen on both
        const subscriptions = [navigation, navigation.getParent()]
          .filter(Boolean)
          .map((nav: any) => nav.addListener('tabPress', resetFilter))
        return () => subscriptions.forEach((unsubscribe: any) => unsubscribe?.())
    }, [navigation, reset]);

    // Only the Frisky playlist defines what a lit heart means, so only it may
    // replace the store's key map. The other views carry per-track flags the
    // API resolved against the list the hearts write to.
    const setKeysFromTracks = useFavoritesStore((state) => state.setKeysFromTracks)
    const applyServerFlags = useFavoritesStore((state) => state.applyServerFlags)
    // a heart on this tab writes to the list the picker is showing
    const setScope = useFavoritesStore((state) => state.setScope)
    useEffect(() => {
        setScope(selectionQuery(selection))
    }, [selection, setScope]);
    useEffect(() => {
        if (selection.kind === 'frisky') {
            setKeysFromTracks(tracks as any)
        } else {
            applyServerFlags(tracks as any)
        }
    }, [tracks, selection, setKeysFromTracks, applyServerFlags]);

    const scrollY = useSharedValue(0);
    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.value = event.nativeEvent.contentOffset.y;
    }, [scrollY]);
    const HEADER_HEIGHT = layout.headerContentHeight + insets.top;

    // Search runs on the SERVER, scoped to whatever the picker selected: the
    // whole playlist is read and filtered there, not just the loaded page. With
    // "All" the answer also carries `global` — the rest of VK — which is shown
    // under a heading below the user's own tracks.
    const debouncedQuery = useDebouncedValue(query, 400)
    const [searchResults, setSearchResults] = useState<Track[]>([])
    const [globalResults, setGlobalResults] = useState<Track[]>([])
    const [searching, setSearching] = useState(false)

    useEffect(() => {
        const term = debouncedQuery.trim()
        if (term.length < 2) {
            setSearchResults([])
            setGlobalResults([])
            setSearching(false)
            return
        }

        let cancelled = false
        setSearching(true)
        searchFavorites(selectionQuery(selection), term)
          .then(({items, global}) => {
              if (cancelled) return
              setSearchResults(items as Track[])
              setGlobalResults(global as Track[])
          })
          .catch((error) => console.warn('Search failed', error))
          .finally(() => {
              if (!cancelled) setSearching(false)
          })

        return () => {
            cancelled = true
        }
    }, [debouncedQuery, selection])

    const isSearching = debouncedQuery.trim().length >= 2
    // the VK-wide section belongs to the "All" view only
    const hasSuggestions = isSearching && selection.kind === 'all' && globalResults.length > 0

    const listData = useMemo(() => {
        if (!isSearching) return tracks
        return hasSuggestions ? [...searchResults, SUGGESTED, ...globalResults] : searchResults
    }, [isSearching, hasSuggestions, tracks, searchResults, globalResults])

    return (
      <View style={{...defaultStyles.container}}>
          <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>
          <AnimatedSearchHeader
            title="Favorites"
            placeholder="Find in favorites"
            onSearchChange={setQuery}
            scrollY={scrollY}
            action={<PlaylistFilter selection={selection} onChange={pickSelection}/>}
          />
          <TrackList
            id={generateTracksListId(
              `favorites-${selection.kind === 'playlist' ? selection.id : selection.kind}`,
              listData.length,
              debouncedQuery,
            )}
            tracks={listData}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{
                paddingTop: HEADER_HEIGHT,
                paddingBottom: layout.tabBarContentHeight + 80,
                paddingHorizontal: screenPadding.horizontal,
            }}
            // a search answer is complete; only the plain list is a window
            onEndReached={isSearching ? undefined : loadMore}
            onEndReachedThreshold={0.6}
            onStartReached={isSearching ? undefined : loadPrevious}
            onStartReachedThreshold={0.4}
            ListEmptyComponent={
                searching
                  ? <ActivityIndicator color="white" style={{marginTop: 24}}/>
                  : <Text style={favoritesStyles.emptyLine}>Nothing in this list</Text>
            }
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
export default FavoriteScreen;

const favoritesStyles = StyleSheet.create({
    emptyLine: {
        color: colors.textMuted,
        fontSize: fonts.sm,
        marginTop: 24,
    },
})

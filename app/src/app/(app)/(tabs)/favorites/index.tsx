import {defaultStyles} from "@/styles"
import {ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, StatusBar, StyleSheet, Text, View} from "react-native"
import {colors, fonts, layout, screenPadding} from "@/constants";
import {TrackList, TrackListSection} from "@/components/TrackList";
import {generateTracksListId, trackKey} from "@/helpers/miscellaneous";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Track} from "react-native-track-player";
import {fetchFavoritesPage, searchFavorites, syncFriskyFavorites} from "@/helpers/network";
import {useDebouncedValue} from "@/hooks/useDebouncedValue";
import {useFocusEffect, useNavigation} from "expo-router";
import {useFavoritesStore} from "@/store/favorites";
import {useSettingsStore} from "@/store/settings";
import {useSharedValue} from "react-native-reanimated";
import {AnimatedSearchHeader} from "@/components/AnimatedSearchHeader";
import {PullToRefresh} from "@/components/PullToRefresh";
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
    const {tracks, refreshing, loadingMore, reset, refreshWindow, loadMore, loadPrevious} =
      useWindowedTracks(loadPage, true, cacheKey)

    const pickSelection = useCallback((next: PlaylistSelection) => {
        selectionRef.current = next;
        setSelection(next);
        setQuery('');
        reset();
    }, [reset])

    // Hearts are toggled on the Songs tab and in the player, so re-read the
    // list every time this tab comes back into view — the pages that are ON
    // SCREEN, not the list from the top.
    //
    // This used to call `reset()`. Closing the player refocuses this screen, so
    // playing a track from the bottom of a long list and then collapsing the
    // player threw the window back to page 0 and the scroll to the top — with
    // no way back except paging down again. `refreshWindow` re-reads the same
    // pages in place and keeps the position; see useWindowedTracks, which was
    // built for exactly this and was not being used for it.
    useFocusEffect(
      useCallback(() => {
          void refreshWindow();
      }, [refreshWindow])
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
            // every row of a playlist view is in THAT playlist, which says
            // nothing about Frisky-favorites — and the player reads that one
            applyServerFlags(tracks as any, 'scope')
        }
    }, [tracks, selection, setKeysFromTracks, applyServerFlags]);

    // Switching to "All" is the moment the library is on screen, so it is the
    // moment to sweep the frisky tracks out of it and into the playlist this
    // tab is otherwise made of — years of hearts predate that playlist. Once
    // per visit to the tab: the sweep is idempotent, but it still costs VK
    // calls, and the picker can be opened a dozen times in a row.
    const autoSync = useSettingsStore((state) => state.autoSyncFavorites)
    const swept = useRef(false)
    useEffect(() => {
        if (selection.kind !== 'all' || !autoSync || swept.current) return
        swept.current = true
        syncFriskyFavorites()
          // the Frisky list changed, and the hearts on this screen are read
          // from it — but only a sweep that actually added something is worth a
          // reload
          .then((result) => {
              if (result.added > 0) reset()
          })
          .catch((error) => console.warn('Unable to sync the favorites', error))
    }, [selection, autoSync, reset]);

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

    // A row this session removed is gone from the list at once. The window is
    // not refetched on a toggle — nothing would have taken it out until the
    // next reload, so "remove from favorites" left the row sitting there.
    const overrides = useFavoritesStore((state) => state.overrides)

    const isSearching = debouncedQuery.trim().length >= 2
    // the VK-wide section belongs to the "All" view only
    const hasSuggestions = isSearching && selection.kind === 'all' && globalResults.length > 0

    const listData = useMemo(() => {
        const base = !isSearching
          ? tracks
          : hasSuggestions
            ? [...searchResults, SUGGESTED, ...globalResults]
            : searchResults
        // the VK-wide suggestions are NOT in this list, so a `false` there means
        // nothing and must not hide them
        return base.filter((item: any) => {
            if ((item as TrackListSection).__section) return true
            const key = trackKey(item)
            return !(key !== undefined && overrides[key] === false)
        })
    }, [isSearching, hasSuggestions, tracks, searchResults, globalResults, overrides])

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
          {/* the desktop's swipe-down; a pass-through on the phones, which
              have the gesture already — see PullToRefresh */}
          <PullToRefresh scrollY={scrollY} onRefresh={reset} refreshing={refreshing} topOffset={HEADER_HEIGHT}>
            <TrackList
              // every row here IS a favourite; a heart on each of them is a
              // column of decoration. Swipe left is how one leaves.
              showFavorite={false}
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
          </PullToRefresh>
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

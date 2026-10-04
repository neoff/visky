import {PullToRefresh} from "@/components/PullToRefresh"
import {TrackList} from "@/components/TrackList"
import {colors, fonts, layout, screenPadding} from "@/constants"
import {generateTracksListId} from "@/helpers/miscellaneous"
import {fetchArtistPage} from "@/helpers/network"
import {useWindowedTracks} from "@/hooks/useWindowedTracks"
import {defaultStyles} from "@/styles"
import {Ionicons} from "@expo/vector-icons"
import {useLocalSearchParams, useNavigation, useRouter} from "expo-router"
import {useCallback} from "react"
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import {useSharedValue} from "react-native-reanimated"
import {useSafeAreaInsets} from "react-native-safe-area-context"

/**
 * One DJ's shows.
 *
 * A plain windowed list, the same one Songs uses — a resident with fifteen
 * years on the station has hundreds of uploads, and this screen is reached by
 * tapping a name, so it is the one place the archive is already narrow enough
 * to read straight through.
 *
 * `name` is passed alongside `key` so the header is right on the first frame:
 * the directory that knows the spelling is on the screen behind this one, and
 * re-fetching it to draw a title would leave the bar empty until it answered.
 */
const ArtistTracksScreen = () => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const navigation = useNavigation()
  const {key, name} = useLocalSearchParams<{key: string; name?: string}>()

  const {tracks, refreshing, loadingMore, reset, loadMore, loadPrevious} = useWindowedTracks(
    useCallback(
      (offset: number, count: number) => fetchArtistPage(String(key), offset, count),
      [key],
    ),
    Boolean(key),
  )

  const scrollY = useSharedValue(0)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y
  }, [scrollY])

  const HEADER_HEIGHT = layout.headerContentHeight + insets.top

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) router.back()
    else router.replace('/artists')
  }, [navigation, router])

  return (
    <View style={{...defaultStyles.container}}>
      <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>

      <View style={[styles.header, {paddingTop: insets.top, height: HEADER_HEIGHT}]}>
        <TouchableOpacity onPress={goBack} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.icon}/>
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.title}>{name ?? 'Artist'}</Text>
      </View>

      <PullToRefresh scrollY={scrollY} onRefresh={reset} refreshing={refreshing} topOffset={HEADER_HEIGHT}>
        <TrackList
          id={generateTracksListId(`artist-${key}`, tracks.length)}
          tracks={tracks}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: HEADER_HEIGHT,
            paddingBottom: layout.tabBarContentHeight + 80,
            paddingHorizontal: screenPadding.horizontal,
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          onStartReached={loadPrevious}
          onStartReachedThreshold={0.4}
          ListEmptyComponent={
            // NO spinner here. The refresh — the phone's RefreshControl, the
            // desktop's overscroll indicator — already draws one for exactly
            // this moment, and a second one in the middle of the empty list was
            // the "крутилка двоится" on entering an artist.
            refreshing ? null : <Text style={styles.emptyLine}>Nothing here yet</Text>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="white" style={{marginVertical: 16}}/> : undefined
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

export default ArtistTracksScreen

const styles = StyleSheet.create({
  // Sits over the list, like AnimatedSearchHeader does on the tabs, so the
  // artwork scrolls under it instead of stopping at a solid band.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    paddingHorizontal: screenPadding.horizontal,
    backgroundColor: colors.surfaceHeader,
  },
  back: {
    width: 28,
    alignItems: 'flex-start',
  },
  title: {
    ...defaultStyles.text,
    flex: 1,
    fontSize: fonts.lg,
    fontWeight: '700',
  },
  emptyLine: {
    color: colors.textMuted,
    fontSize: fonts.sm,
    marginTop: 24,
  },
})

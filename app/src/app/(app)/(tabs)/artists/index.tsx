import {ArtistListItem} from "@/components/ArtistListItem"
import {AnimatedSearchHeader} from "@/components/AnimatedSearchHeader"
import {PullToRefresh} from "@/components/PullToRefresh"
import {colors, fonts, layout, screenPadding} from "@/constants"
import {Artist, loadArtists} from "@/helpers/network"
import {defaultStyles} from "@/styles"
import {useRouter} from "expo-router"
import {useCallback, useEffect, useMemo, useState} from "react"
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native"
import {useSharedValue} from "react-native-reanimated"
import {useSafeAreaInsets} from "react-native-safe-area-context"

/**
 * The DJs behind the archive.
 *
 * The whole directory arrives in one call — a few hundred rows, ordered by how
 * much of the archive is theirs — so unlike Songs and Favorites this screen has
 * no sliding window and its search filters what it already holds rather than
 * asking the server again.
 */
const ArtistsScreen = () => {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      setArtists(await loadArtists())
      setFailed(false)
    } catch (error) {
      console.warn('Artists failed to load', error)
      setFailed(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const reset = useCallback(() => {
    void load(true)
  }, [load])

  // Filtered here, not on the server: the list is already in hand, and a name
  // is short enough that a substring match is the whole of what "find a DJ"
  // means.
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length === 0) return artists
    return artists.filter((artist) => artist.name.toLowerCase().includes(term))
  }, [artists, query])

  const scrollY = useSharedValue(0)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y
  }, [scrollY])
  const HEADER_HEIGHT = layout.headerContentHeight + insets.top

  const openArtist = useCallback((artist: Artist) => {
    router.push({
      pathname: '/artists/[key]',
      params: {key: artist.key, name: artist.name},
    })
  }, [router])

  return (
    <View style={{...defaultStyles.container}}>
      <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>
      <AnimatedSearchHeader
        title="Artists"
        placeholder="Find an artist"
        onSearchChange={setQuery}
        scrollY={scrollY}
      />
      <PullToRefresh scrollY={scrollY} onRefresh={reset} refreshing={refreshing} topOffset={HEADER_HEIGHT}>
        <FlatList
          data={visible}
          keyExtractor={(artist) => artist.key}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: HEADER_HEIGHT,
            paddingBottom: layout.tabBarContentHeight + 80,
            paddingHorizontal: screenPadding.horizontal,
          }}
          renderItem={({item}) => <ArtistListItem artist={item} onSelect={openArtist}/>}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color="white" style={{marginTop: 24}}/>
              : <Text style={styles.emptyLine}>
                  {failed ? 'Could not load the artists' : 'No artist by that name'}
                </Text>
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

export default ArtistsScreen

const styles = StyleSheet.create({
  emptyLine: {
    color: colors.textMuted,
    fontSize: fonts.sm,
    marginTop: 24,
  },
})

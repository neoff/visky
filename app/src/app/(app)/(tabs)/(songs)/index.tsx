// src/app/(app)/(tabs)/(songs)/index.tsx
import {TrackList} from "@/components/TrackList"
import {modifiers, screenPadding} from "@/constants"
import {trackTitleFilter} from '@/helpers/filter'
import {generateTracksListId, reducer} from '@/helpers/miscellaneous'
import {loadPlayListData, loadFriskyListData} from "@/helpers/network"
import {TrackWithPlaylist} from "@/helpers/types"
import {useNavigationSearch} from '@/hooks/useNavigationSearch'
import {storage} from '@/store/library'
import {defaultStyles} from '@/styles'
import {useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, NativeScrollEvent, RefreshControl, ScrollView, StatusBar, View} from 'react-native'
import {useMMKVStorage} from "react-native-mmkv-storage"
import {Track} from 'react-native-track-player'
import {useSession} from "@/components/SessionProvider";
import {usePlaylistState} from "@/hooks/usePlaylistState";
import {useSearchStore} from "@/hooks/useSearchStore";
import Animated, {useAnimatedRef, useSharedValue, useAnimatedScrollHandler} from "react-native-reanimated";
import {AnimatedSearchHeader} from "@/components/AnimatedSearchHeader";
import {useSafeAreaInsets} from "react-native-safe-area-context";


const SongsScreen = () => {
  const { top, bottom } = (() => {
    const insets = useSafeAreaInsets()
    return { top: insets.top + modifiers.safe, bottom: insets.bottom + modifiers.safe }
  })()
  const {refreshing, search, tracks, filteredTracks, handleRefresh, sessionLoading} = usePlaylistState('tracks')
  //const updateOffset = useRef<boolean>(false)



  //const { getSession , signIn} = useSession();
  //const [refreshing, setRefreshing] = useState(false);

  //const [cachedTrack, setCachedTrack] = useMMKVStorage<TrackWithPlaylist[]>('tracks', storage, []);
  //const [tracks, setTracks] = useState<Track[]>(cachedTrack);
  /*const search = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in songs',
    },
  })*/

  /*const mergeTracks = async (data: any) => {
    console.debug(`Merging tracks ${data?.items.length} with ${tracks.length}`)
    setCachedTrack(data?.items)
    const result = reducer([...data?.items, ...tracks])
    console.debug(`-->SongsScreen Result ${result.length}`)
    setTracks(result);
    return result;
  }*/


  /*const handleRefresh = () => {
    console.log('-->SongsScreen refreshing')
    loadPlaylistData({
      onLoad: mergeTracks,
      onError: loadError,
      cache: setCachedTrack,
      getSession: getSession,
      updateSession: signIn,
      offset: 0
    })
      .finally(() => setRefreshing(false))
  }*/

  /*useEffect(() => {
    if (tracks.length < 1) {
      setRefreshing(true)
      handleRefresh();
    }

  }, []);*/


  /*const filteredTracks: Track[] = useMemo(() => {
    if (!search) return tracks

    return tracks.filter(trackTitleFilter(search))
  }, [search, tracks])*/

  /*const isCloseToBottom = ({layoutMeasurement, contentOffset, contentSize}: NativeScrollEvent) => {
    const paddingToBottom = 100;
    //console.log('isCloseToBottom', layoutMeasurement.height + contentOffset.y, contentSize.height - paddingToBottom)
    return layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;
  };*/
  /*onScroll={({nativeEvent}) => {
          //console.log('End of list ->> refresh:', updateOffset.current)
          if (updateOffset.current) return
          if (isCloseToBottom(nativeEvent)) {
            updateOffset.current = true
            //console.log('Set refresh:', updateOffset.current)
            loadPlaylistData({
              onLoad: (data: any) => data,
              onError: loadError,
              cache: (data: any) => data,
              offset: tracks.length
            })
              .then((data) => {
                //console.debug(`Merging tracks ${data?.items.length} with ${tracks.length}`)
                const result = reducer([...tracks, ...data?.items])
                //console.debug(`Result ${result.length}`)
                setTracks(result);
                updateOffset.current = false
              })
              .finally(() => {
                //setRefreshing(false)
              })
          }
        }}*/


  const refreshFn = () => {
    handleRefresh(loadFriskyListData);
  }

  useEffect(() => {
    // Wait for session to load before initial refresh
    if (sessionLoading) {
      return;
    }
    
    if (tracks.length < 1) {
      //setRefreshing(true)
      refreshFn();
    }

  }, [sessionLoading]);

  const searchs = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in songs',
    },
  })
  const filteredTrack: Track[] = useMemo(() => {
    if (!searchs) return tracks
    return tracks.filter(trackTitleFilter(searchs))
  }, [searchs, tracks])

  const query = useSearchStore((s) => s.query)
  const filteredSongs = tracks.filter(() =>{
    if (!searchs) return tracks
    return tracks.filter(trackTitleFilter(query.toLowerCase()))
  })

  //const scrollRef = useAnimatedRef<ScrollView>();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const HEADER_HEIGHT = top + 110 + modifiers.scroll;


  const isFetchingMore = useRef(false);

  return (
    <View style={{...defaultStyles.container}}>
      <StatusBar translucent barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.251)"/>
      <AnimatedSearchHeader
        title="Songs"
        placeholder="Find in songs"
        onSearchChange={(text) => useSearchStore.getState().setQuery(text)}
        scrollY={scrollY}
      />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT, minHeight: '100%', }}
        refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshFn}
          tintColor="white"
          progressViewOffset={HEADER_HEIGHT}
          colors={['white']} />
      }
      >
        <TrackList
          id={generateTracksListId('songs', tracks.length, searchs)}
          tracks={filteredSongs}
          scrollEnabled={false}
          refresh={!refreshing}
        />
      </Animated.ScrollView>
    </View>
  )
}

export default SongsScreen

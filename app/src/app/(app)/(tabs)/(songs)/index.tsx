import {TrackList} from "@/components/TrackList"
import {screenPadding} from "@/constants"
import {trackTitleFilter} from '@/helpers/filter'
import {generateTracksListId, reducer} from '@/helpers/miscellaneous'
import {loadFavoriveData, loadPlaylistData} from "@/helpers/network"
import {TrackWithPlaylist} from "@/helpers/types"
import {useNavigationSearch} from '@/hooks/useNavigationSearch'
import {storage} from '@/store/library'
import {defaultStyles} from '@/styles'
import {useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, NativeScrollEvent, RefreshControl, ScrollView, View} from 'react-native'
import {useMMKVStorage} from "react-native-mmkv-storage"
import {Track} from 'react-native-track-player'
import {useSession} from "@/components/SessionProvider";
import {usePlaylistState} from "@/hooks/usePlaylistState";


const SongsScreen = () => {
  const {refreshing, search, tracks, filteredTracks, handleRefresh} = usePlaylistState('tracks')
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
    handleRefresh(loadPlaylistData);
  }

  useEffect(() => {
    if (tracks.length < 1) {
      //setRefreshing(true)
      refreshFn();
    }

  }, []);

  return (
    <View style={defaultStyles.container}>
      {refreshing ? <ActivityIndicator/> : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{paddingHorizontal: screenPadding.horizontal}}

        scrollEventThrottle={500}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFn} // exl in function : this.yourWebview.reload();
          />
        }
      >
        <TrackList
          id={generateTracksListId('songs', tracks.length, search)}
          tracks={filteredTracks}
          scrollEnabled={false}
          refresh={!refreshing}
        />
      </ScrollView>
    </View>
  )
}

export default SongsScreen

import {trackTitleFilter} from '@/helpers/filter'
import {generateTracksListId, reducer} from '@/helpers/miscellaneous'
import {useNavigationSearch} from '@/hooks/useNavigationSearch'
import {storage} from '@/store/library'
import {defaultStyles} from '@/styles'
import {useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, NativeScrollEvent, RefreshControl, ScrollView, View} from 'react-native'
import {Track} from 'react-native-track-player'
import {screenPadding} from "@/constants";
import {TrackList} from "@/components/TrackList";
import {loadPlaylistData} from "@/helpers/network";
import {useMMKVStorage} from "react-native-mmkv-storage";
import {TrackWithPlaylist} from "@/helpers/types";
import {unknownTrackImageUri} from "@/constants/images";


const SongsScreen = () => {
  const [refreshing, setRefreshing] = useState(false);
  const updateOffset = useRef<boolean>(false)
  const [cachedTrack, setCachedTrack] = useMMKVStorage<TrackWithPlaylist[]>('tracks', storage, []);
  const [tracks, setTracks] = useState<Track[]>(cachedTrack);
  const search = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in songs',
    },
  })

  const mergeTracks = async (data: any) => {
    console.debug(`Merging tracks ${data?.items.length} with ${tracks.length}`)
    const items =  data?.items.map((item:TrackWithPlaylist ) => ({
        ...item,
        date: item?.date?.toString(),
        album: item?.album?.title ?? 'Unknown Album',
        artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
      }))
    setCachedTrack(items)
    const result = reducer([...items, ...tracks])
    console.debug(`Result ${result.length}`)
    setTracks(result);
    return result;
  }
  const loadError = (error:any) => {
    console.log('Load playlist error:', error)

    console.error('Playlist error', error);
    alert(error.response.data.errData);
    return error;
  }

  const handleRefresh = () => {
    console.log('refreshing')
    loadPlaylistData(mergeTracks, loadError, 0).finally(() => setRefreshing(false) )
  }

  useEffect(() => {
    if(tracks.length < 100){
      setRefreshing(true)
      handleRefresh();
    }

  }, []);


  const filteredTracks: Track[] = useMemo(() => {
    if (!search) return tracks

    return tracks.filter(trackTitleFilter(search))
  }, [search, tracks])

  const isCloseToBottom = ({layoutMeasurement, contentOffset, contentSize}: NativeScrollEvent) => {
    const paddingToBottom = 100;
    //console.log('isCloseToBottom', layoutMeasurement.height + contentOffset.y, contentSize.height - paddingToBottom)
    return layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;
  };
  return (
    <View style={defaultStyles.container}>
      {refreshing ? <ActivityIndicator/> : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{paddingHorizontal: screenPadding.horizontal}}
        onScroll={({nativeEvent}) => {
          //console.log('End of list ->> refresh:', updateOffset.current)
          if(updateOffset.current) return
          if (isCloseToBottom(nativeEvent)) {
            updateOffset.current = true
            //console.log('Set refresh:', updateOffset.current)
            loadPlaylistData((data:any) => data, loadError, tracks.length)
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
        }}
        scrollEventThrottle={500}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh} // exl in function : this.yourWebview.reload();
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

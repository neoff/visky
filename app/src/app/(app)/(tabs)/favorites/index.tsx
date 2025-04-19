import { defaultStyles } from "@/styles"
import {ActivityIndicator, RefreshControl, ScrollView, Text, View} from "react-native"
import {screenPadding} from "@/constants";
import {TrackList} from "@/components/TrackList";
import {generateTracksListId, reducer} from "@/helpers/miscellaneous";
import {useEffect, useMemo, useRef, useState} from "react";
import {Track} from "react-native-track-player";
import {trackTitleFilter} from "@/helpers/filter";
import {storage} from "@/store/library";
import {useNavigationSearch} from "@/hooks/useNavigationSearch";
import {loadPlayListData} from "@/helpers/network";
import {useSession} from "@/components/SessionProvider";
import {useMMKVStorage} from "react-native-mmkv-storage";
import {TrackWithPlaylist} from "@/helpers/types";
import {unknownTrackImageUri} from "@/constants/images";
import {usePlaylistState} from "@/hooks/usePlaylistState";

const FavoriteScreen = () => {
    const {refreshing, search, tracks, filteredTracks, handleRefresh} = usePlaylistState('favorites')

    //const [refreshing, setRefreshing] = useState(false);
    const updateOffset = useRef<boolean>(false)
    //const [tracks, setTracks] = useState<Track[]>(useFavorites().favorites as Track[]);


    //const [cachedTrack, setCachedTrack] = useMMKVStorage<Track[]>('favorites', storage, []);
   // const [tracks, setTracks] = useState<Track[]>(cachedTrack);

    /*const search = useNavigationSearch({
        searchBarOptions: {
            placeholder: 'Find in songs',
        },
    })*/
    //const favoritesTracks = useFavorites().favorites
    /*const mergeTracks = async (data: any) => {
        console.debug(`Merging tracks ${data?.items.length} with ${tracks?.length}`)
        setCachedTrack(data?.items)
        const result = reducer([...data?.items, ...tracks])
        console.debug(`Result ${result.length}`)
        setTracks(result);
        return result;
    }*/
    const loadError = (error:any) => {
        console.log('Load playlist error:', error)

        console.error('Playlist error', error);
        alert(error.response.data.errData);
    }

    /*const handleRefresh = () => {
        console.log('refreshing')
        loadFavoriveData(getSession().user_id, mergeTracks, loadError).finally(() => setRefreshing(false))
    }*/

    /*const filteredFavoritesTracks: Track[]  = useMemo(() => {
        if (!search) return tracks

        return tracks.filter(trackTitleFilter(search))
    }, [search, tracks])*/
    const refreshFn = () => {
        handleRefresh(loadPlayListData);
    }
    useEffect(() => {
        if(!tracks.length)
            refreshFn();
    }, []);

    return <View style={defaultStyles.container}>
        {refreshing ? <ActivityIndicator/> : null}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{paddingHorizontal: screenPadding.horizontal}}
          refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshFn} // exl in function : this.yourWebview.reload();
              />
          }
        >
            <TrackList
              id={generateTracksListId('favorites', tracks.length, search)}
              tracks={filteredTracks}
              scrollEnabled={false}
            />
        </ScrollView>
    </View>
}
export default FavoriteScreen;
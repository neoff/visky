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
import {loadFavoriveData} from "@/helpers/network";
import {useSession} from "@/components/SessionProvider";
import {useMMKVStorage} from "react-native-mmkv-storage";
import {TrackWithPlaylist} from "@/helpers/types";
import {unknownTrackImageUri} from "@/constants/images";

const FavoriteScreen = () => {
    const [refreshing, setRefreshing] = useState(false);
    const updateOffset = useRef<boolean>(false)
    //const [tracks, setTracks] = useState<Track[]>(useFavorites().favorites as Track[]);
    const [cachedTrack, setCachedTrack] = useMMKVStorage<Track[]>('favorites', storage, []);
    const [tracks, setTracks] = useState<Track[]>(cachedTrack);
    const { getSession } = useSession();
    const search = useNavigationSearch({
        searchBarOptions: {
            placeholder: 'Find in songs',
        },
    })
    //const favoritesTracks = useFavorites().favorites
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
    }

    const handleRefresh = () => {
        console.log('refreshing')
        loadFavoriveData(getSession().user_id, mergeTracks, loadError).finally(() => setRefreshing(false))
    }

    const filteredFavoritesTracks: Track[]  = useMemo(() => {
        if (!search) return tracks

        return tracks.filter(trackTitleFilter(search))
    }, [search, tracks])

    useEffect(() => {
        if(!tracks.length)
            handleRefresh();
    }, []);

    return <View style={defaultStyles.container}>
        {refreshing ? <ActivityIndicator/> : null}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{paddingHorizontal: screenPadding.horizontal}}
          refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh} // exl in function : this.yourWebview.reload();
              />
          }
        >
            <TrackList
              id={generateTracksListId('favorites', tracks.length, search)}
              tracks={filteredFavoritesTracks}
              scrollEnabled={false}
            />
        </ScrollView>
    </View>
}
export default FavoriteScreen;
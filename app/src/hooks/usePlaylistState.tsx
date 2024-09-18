import {useEffect, useMemo, useState} from "react";
import {useMMKVStorage} from "react-native-mmkv-storage";
import {TrackWithPlaylist} from "@/helpers/types";
import {storage} from "@/store/library";
import {Track} from "react-native-track-player";
import {useNavigationSearch} from "@/hooks/useNavigationSearch";
import {reducer} from "@/helpers/miscellaneous";
import {loadPlaylistData, refreshToken} from "@/helpers/network";
import {useSession} from "@/components/SessionProvider";
import {NativeScrollEvent} from "react-native";
import {trackTitleFilter} from "@/helpers/filter";
import {AxiosError} from "axios";

export const usePlaylistState = (name: string) => {
  const { getSession , signIn} = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [cachedTrack, setCachedTrack] = useMMKVStorage<TrackWithPlaylist[]>(name, storage, []);
  const [tracks, setTracks] = useState<Track[]>(cachedTrack);
  const search = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in songs',
    },
  })
  const mergeTracks = async (data: any) => {
    console.debug(`Merging tracks ${data.length} with ${tracks.length}`)
    setCachedTrack(data)
    const result = reducer([...data, ...tracks])
    console.debug(`-->SongsScreen Result ${result.length}`)
    setTracks(result);
    return result;
  }
  const handleRefresh = (refreshFunction: (owner:string, mergeTracks: any, loadError: any, offset: number) => Promise<any>) => {
    console.log('-->SongsScreen refreshing')
    /*loadPlaylistData({
      onLoad: mergeTracks,
      onError: loadError,
      cache: setCachedTrack,
      getSession: getSession,
      updateSession: signIn,
      offset: 0
    })*/
    refreshFunction(getSession().user_id, mergeTracks, loadError, 0)
      .finally(() => setRefreshing(false))
  }
  const logRefresh = (data: any) => {
    console.debug('-->!!!!logRefresh refreshing')
    signIn(data)
    return data
  }
  const loadError = (error: AxiosError) => {
    console.error(`-->Tab ${name} Playlist error`, error.message, error);

    if(error.status === 403){
      console.error("==ERROR loadError REDIRECT: 403 error:", error);
      const resp = refreshToken({onLoad: logRefresh, onError: loadError,}, getSession());
      console.log("==ERROR loadError REDIRECT: 403 resp:", resp);
      //TODO: check if all fine remove null and call handleRefresh()
      return handleRefresh(loadPlaylistData);
    }
    const errorMessage = (error.response?.data as { message?: string })?.message || error.message;
    alert(errorMessage);
    return error;
  }



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


  return {refreshing, tracks, search, filteredTracks,  handleRefresh, isCloseToBottom}
}
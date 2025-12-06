import {useEffect, useMemo, useState} from "react";
import {useMMKVStorage} from "react-native-mmkv-storage";
import {TrackWithPlaylist} from "@/helpers/types";
import {storage} from "@/store/library";
import {Track} from "react-native-track-player";
import {useNavigationSearch} from "@/hooks/useNavigationSearch";
import {reducer} from "@/helpers/miscellaneous";
import {loadFriskyListData, refreshToken} from "@/helpers/network";
import {useSession} from "@/components/SessionProvider";
import {NativeScrollEvent} from "react-native";
import {trackTitleFilter} from "@/helpers/filter";
import {AxiosError} from "axios";
import {AuthFragments} from "@/types/auth";
import axios from 'axios';

export const usePlaylistState = (name: string) => {
  const {getSession, signIn, isLoading: sessionLoading} = useSession();
  const userSession: AuthFragments = getSession() as AuthFragments;
  const [refreshing, setRefreshing] = useState(false);
  const [cachedTrack, setCachedTrack] = useMMKVStorage<TrackWithPlaylist[]>(name, storage, []);
  const [tracks, setTracks] = useState<Track[]>(cachedTrack);
  const search = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in songs',
    },
  })

  const mergeTracks: (data: any) => Promise<any[]> = async (data: any): Promise<any[]> => {
    //console.debug(`Merging ->>>`, data)
    console.debug(`Merging tracks ${data?.length} with ${tracks?.length}`)
    setCachedTrack(data)
    const result = reducer([...data, ...tracks])
    console.debug(`-->SongsScreen Result ${result.length}`)
    setTracks(result);
    return result;
  }

  const handleRefresh = (refreshFn: (owner: string | null, mergeTracks: any, loadError: any, offset: number) => Promise<any>): void => {
    // Wait for session to load before making API requests
    console.log('-->handleRefresh called, sessionLoading:', sessionLoading);
    if (sessionLoading) {
      console.log('-->SongsScreen Session still loading, skipping refresh');
      return;
    }
    
    console.log('-->handleRefresh userSession:', userSession);
    console.log('-->handleRefresh axios headers:', {
      token: axios.defaults.headers.common['x-auth-token'],
      user: axios.defaults.headers.common['x-auth-user'],
      secret: axios.defaults.headers.common['x-auth-secret']
    });
    
    setRefreshing(true);
    console.log('-->SongsScreen refreshing')
    /*loadPlaylistData({
      onLoad: mergeTracks,
      onError: loadError,
      cache: setCachedTrack,
      getSession: getSession,
      updateSession: signIn,
      offset: 0
    })*/
    refreshFn(userSession.user_id, mergeTracks, loadError, 0)
      .finally(() => setRefreshing(false))
  }
  const logRefresh = (data: any): any => {
    console.debug('-->!!!!logRefresh refreshing')
    signIn(data)
    return data
  }
  const loadError = (error: AxiosError) => {
    console.error(`-->Tab ${name} Playlist error`, error.message, error);

    if (error.status === 403) {
      console.error("==ERROR loadError REDIRECT: 403 error:", error);
      // Call GET /api/auth/refresh to get new token from VK API
      const resp = refreshToken({onLoad: logRefresh, onError: loadError}, null);
      console.log("==ERROR loadError REDIRECT: 403 resp:", resp);
      //TODO: check if all fine remove null and call handleRefresh()
      return handleRefresh(loadFriskyListData);
    }
    
    const errorData = error.response?.data as { errMessage?: string; message?: string };
    const errorMessage = errorData?.errMessage || errorData?.message || error.message;
    
    // Check if it's a VK IP address error
    if (errorMessage.includes('access_token was given to another ip address') || 
        errorMessage.includes('User authorization failed')) {
      alert(
        'Session Expired\n\n' +
        'Your VK session has expired or is invalid.\n\n' +
        'Please:\n' +
        '1. Go to Settings tab\n' +
        '2. Tap "Sign Out"\n' +
        '3. Sign in again with VK'
      );
    } else {
      alert(`Error: ${errorMessage}`);
    }
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


  return {refreshing, tracks, search, filteredTracks, handleRefresh, isCloseToBottom, setRefreshing, sessionLoading}
}
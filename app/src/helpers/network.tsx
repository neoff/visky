import {AuthFragments} from "@/components/SessionProvider";
import {apiUrls, headers} from "@/constants";
import {unknownTrackImageUri} from "@/constants/images";
import {TrackWithPlaylist} from "@/helpers/types";
import axios, {AxiosError, AxiosRequestConfig, Method} from "axios";
import {TrackType} from "react-native-track-player";


const registerInterceptors = () => {
  console.log("registerAuth");
  axios.interceptors.request.use((config) => {
    console.log("axios.interceptors.request:", config);
    return config;
  }, (error) => {
    console.error("axios.interceptors.request error:", error);
    return Promise.reject(error);
  });

  axios.interceptors.response.use((response) => {
    console.log("axios.interceptors.response:", response);
    return response;
  }, (error) => {
    console.error("axios.interceptors.response error:", error);
    return Promise.reject(error);
  });
}
const apiRequest = async (url: string, method: Method | string, {data, next}:{data?: any, next?: () => void}) => {
  /*if (!url) {
    console.error("===Auth: No Token in apiUrls.vkTokenUrl:", url);
    throw new Error("No Token!");
  }*/
  //console.log("===Auth: Token in apiUrls.vkTokenUrl:", url);
  const config: AxiosRequestConfig = {
    url: url,
    method: method,
    data: data,
    headers: headers,
  }
  console.debug("==apiRequest config:", config);

  return await axios
    .request(config)
    .then(response => {
      //console.debug('---->apiRequest-response:', response.data);
      return response.data;
    })
    .catch((error: AxiosError) => {
      console.error(`==ERROR apiRequest: ${error.status} error:`, (error.response?.data as { message?: string })?.message);
      throw error;
    });
}

export const getAuth = ({onLoad}: {onLoad?: (fragments: any) => void}, url?: string | null) => {
  console.debug("getAuth url:", url);
  if (!url) return;
  apiRequest(apiUrls.tokenUrl, 'POST', {data:{"vkurl": url}})
    .then((data) => {
      console.log("--->getAuth-response:", data);
      if(data.redirect){
        return getAuth({onLoad: onLoad}, data.redirect);
      }
      onLoad?.(data);
    })
    .catch((error: AxiosError) => {
      console.error(`===ERROR! getAuth:${error}`);
      throw error;
    });
}

export const refreshToken = ({onLoad, onError}: {onLoad?: (res: any) => void, onError?: (error: any) => void}, data: any) => {
  console.debug("===refreshToken data:", data);
  if (!data) return;
  return apiRequest(apiUrls.refreshUrl, 'POST', {data:data})
    .then((data) => {
      console.log("--->refreshToken-response:", data);
      return onLoad?.(data);
    })
    .catch((error: AxiosError) => {
      console.error(`===ERROR! refreshToken:${error}`);
      throw error;
    });
}

export const loadPlaylistData = (owner:string, onLoad?: (res: any) => any, onError?: (error: any) => void, offset: number = 0) => {
  console.info(`GET ${apiUrls.friskyListUrl}?count=100&offset=0`);
  return apiRequest(`${apiUrls.friskyListUrl}?count=100&offset=${offset}`, 'GET', {})
    .then((data) => {
      //console.log("--->loadPlaylistData-response:", data);
      const items = data?.items.map((item: TrackWithPlaylist) => ({
        ...item,
        date: item?.date?.toString(),
        type: TrackType.HLS,
        album: item?.album?.title ?? 'Unknown Album',
        artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
      }))
      return onLoad?.(items);
      //return data;
    })
    .catch((error: AxiosError)  => {
      console.error(`===ERROR! loadPlaylistData:${error}`);
      throw onError?.(error);
    });
};

export const loadFavoriveData = (owner:string, onLoad?: (fragments: any) => any, onError?: (error: any) => void, offset: number = 0) => {
  const url = `${apiUrls.favoritesListUrl}?count=100&offset=${offset}&owner=${owner}`;
  console.info(`GET ${url}`);
  return apiRequest(url, 'GET', {})
    .then((data) => {
      //console.log("--->loadFavoriveData-response:", data);
      const items = data?.items.map((item: TrackWithPlaylist) => ({
        ...item,
        date: item?.date?.toString(),
        type: TrackType.HLS,
        album: item?.album?.title ?? 'Unknown Album',
        artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
      }))
      return onLoad?.(items);
      //return data;
    })
    .catch((error: AxiosError)  => {
      console.error(`===ERROR! loadFavoriveData:${error}`);
      onError?.(error);
      throw error;
    });
};



/*
const authOf = async (url: string) => {
  return await axios
    .get(url, {headers: headers})
    .then(response => {
      return response.data;
    })
    .catch(error => {
      throw error;
    })

}
export const getAuthOfficial = ({onLoad}: {onLoad?: (fragments: any) => void}) => {
  authOf(apiUrls.authFormUrl)
    .then((data) => {
      //console.log("======HAVE RESPONSE!", data);
      onLoad?.(data);
    })
    .catch((error) => {
      console.error("auth error", error);
      //signOut();
    })
}*/

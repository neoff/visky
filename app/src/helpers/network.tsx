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

export const loadFriskyListData = async (owner: string | null, onLoad?: (res: any) => any, onError?: (error: any) => void, offset: number = 0) : Promise<any> => {
  console.info(`GET ${apiUrls.friskyListUrl}?count=100&offset=0`);
  try {
    const data = await apiRequest(`${apiUrls.friskyListUrl}?count=100&offset=${offset}`, 'GET', {});
    console.log("--->loadPlaylistData-response:", data);
    const items = data?.items?.map((item: TrackWithPlaylist) => ({
      ...item,
      date: item?.date?.toString(),
      type: TrackType.HLS,
      album: item?.album?.title ?? 'Unknown Album',
      artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
    }))
    return onLoad?.(items);
    //return data;
  } catch (error) {
    console.error(`===ERROR! loadPlaylistData:${error}`);
    throw onError?.(error);
  }
};

export const loadPlayListData = async (owner: string | null, onLoad?: (fragments: any) => any, onError?: (error: any) => void, offset: number = 0) => {
  if (!owner) {
    throw new Error('A playlist owner is required');
  }
  const url = `${apiUrls.playListUrl}?count=100&offset=${offset}&owner=${owner}`;
  console.info(`GET ${url}`);
  try {
    let data = await apiRequest(url, 'GET', {});
    //console.log("--->loadFavoriteData-response:", data);
    const items = data?.items?.map((item: TrackWithPlaylist) => ({
      ...item,
      date: item?.date?.toString(),
      type: TrackType.HLS,
      album: item?.album?.title ?? 'Unknown Album',
      artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
    }))
    return onLoad?.(items);
    //return data;
  } catch (error) {
    console.error(`===ERROR! loadFavoriteData:${error}`);
    onError?.(error);
    throw error;
  }
};

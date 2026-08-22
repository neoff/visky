import {apiUrls, headers} from "@/constants";
import {unknownTrackImageUri} from "@/constants/images";
import {TrackWithPlaylist} from "@/helpers/types";
import axios, {AxiosError, AxiosRequestConfig, Method} from "axios";
import {TrackType} from "react-native-track-player";
import {AuthFragments} from "@/types/auth";

/**
 * RN axios does not persist the server session cookie, so authenticated calls
 * carry the token/secret/device_id as headers instead. `checkAuthAndroid` on the
 * backend restores the session from these. device_id MUST match the one issued at
 * direct-grant time — the audio request signature (md5(url+secret)) includes it.
 */
let authHeaders: Record<string, string> = {};
export const setAuthHeaders = (session: AuthFragments | null): void => {
  if (session?.access_token) {
    authHeaders = {
      "x-auth-token": session.access_token,
      ...(session.user_id ? {"x-auth-user": String(session.user_id)} : {}),
      ...(session.secret ? {"x-auth-secret": session.secret} : {}),
      ...(session.device_id ? {"x-auth-device": session.device_id} : {}),
    };
  } else {
    authHeaders = {};
  }
  console.debug("==setAuthHeaders:", Object.keys(authHeaders));
};

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
    headers: {...headers, ...authHeaders},
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

export const getAuth = ({onLoad, onError}: {onLoad?: (fragments: any) => void, onError?: (error: any) => void}, url?: string | null) => {
  console.debug("getAuth url:", url);
  if (!url) return;
  apiRequest(apiUrls.tokenUrl, 'POST', {data:{"vkurl": url}})
    .then((data) => {
      console.log("--->getAuth-response:", data);
      if(data.redirect){
        return getAuth({onLoad, onError}, data.redirect);
      }
      onLoad?.(data);
    })
    .catch((error: AxiosError) => {
      console.error(`===ERROR! getAuth:${error}`);
      onError?.(error);
    });
}

/**
 * Direct token grant. Sends VK login/password (+ optional 2FA code / captcha)
 * to the backend, which emulates a legacy Android app to obtain an
 * audio-capable access_token + secret. Resolves with:
 *   { access_token, secret, user_id, device_id }                -> success
 *   { error:'need_validation', validation_type, phone_mask, device_id, ... }
 *   { error:'need_captcha', captcha_sid, captcha_img, device_id }
 * Challenge responses come back as HTTP 401 (rejected axios) — normalized here
 * to a resolved object so the caller can branch on `.error`.
 */
export const directAuth = async (payload: {
  login: string,
  password: string,
  code?: string,
  captcha_sid?: string,
  captcha_key?: string,
  device_id?: string,
}): Promise<any> => {
  try {
    return await apiRequest(apiUrls.directUrl, 'POST', {data: payload});
  } catch (error) {
    const e = error as AxiosError;
    const body = e.response?.data as any;
    if (e.response?.status === 401 && body?.error) {
      return body; // need_validation | need_captcha
    }
    throw error;
  }
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

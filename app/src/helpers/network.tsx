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

/**
 * The user's Frisky-favorites playlist.
 *
 * Favourites live on VK, not in the phone: the backend keeps a playlist named
 * "Frisky-favorites" and creates it on first use, so this never 404s the way the
 * old `/api/playlist/playlist` call did (that route never existed).
 */
export const loadFavoritesListData = async (
  owner: string | null,
  onLoad?: (res: any) => any,
  onError?: (error: any) => void,
  offset: number = 0,
  /** a playlist id, or 'all' for the user's whole VK library. Omitted = Frisky-favorites. */
  playlistId?: string | number,
): Promise<any> => {
  const filter = playlistId === undefined ? '' : `&playlist_id=${playlistId}`;
  const url = `${apiUrls.favoritesUrl}?count=100&offset=${offset}${filter}`;
  console.info(`GET ${url}`);
  try {
    const data = await apiRequest(url, 'GET', {});
    const items = data?.items?.map((item: TrackWithPlaylist) => ({
      ...item,
      date: item?.date?.toString(),
      type: TrackType.HLS,
      album: item?.album?.title ?? 'Unknown Album',
      artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
      // `favorite` comes from the API: in "all" and in other playlists a track
      // is only a favourite when it also sits in Frisky-favorites
      favorite: item.favorite ?? true,
    })) ?? [];
    return onLoad?.(items);
  } catch (error) {
    console.error(`===ERROR! loadFavoritesListData:${error}`);
    onError?.(error);
    throw error;
  }
};

/** Frisky group id — the owner of every track the Songs tab shows. */
export const FRISKY_OWNER_ID = -42311167;

/**
 * `playlistId` is the list the heart writes to: a playlist id, `all` for the VK
 * library with no playlist, or undefined for Frisky-favorites (which the API
 * creates on the first add).
 */
export const addToFavorites = async (
  track: { id?: string | number; owner_id?: number },
  playlistId?: string | number,
) => {
  return apiRequest(apiUrls.favoritesUrl, 'PUT', {
    data: {
      audio_id: track.id,
      owner_id: track.owner_id ?? FRISKY_OWNER_ID,
      ...(playlistId === undefined ? {} : {playlist_id: playlistId}),
    },
  });
};

export const removeFromFavorites = async (
  track: { id?: string | number; owner_id?: number },
  playlistId?: string | number,
) => {
  const owner = track.owner_id ?? FRISKY_OWNER_ID;
  const filter = playlistId === undefined ? '' : `&playlist_id=${playlistId}`;
  return apiRequest(`${apiUrls.favoritesUrl}/${track.id}?owner_id=${owner}${filter}`, 'DELETE', {});
};

export type UserPlaylist = {
  id: number
  title: string
  count: number
  is_frisky: boolean
}

/** The user's VK playlists, for the picker on the Favorites tab. */
export const loadUserPlaylists = async (): Promise<UserPlaylist[]> => {
  const data = await apiRequest(apiUrls.playlistsUrl, 'GET', {});
  return (data?.items ?? []) as UserPlaylist[];
};

const mapApiTracks = (items: any[] | undefined) =>
  (items ?? []).map((item: TrackWithPlaylist) => ({
    ...item,
    date: item?.date?.toString(),
    type: TrackType.HLS,
    album: item?.album?.title ?? 'Unknown Album',
    artwork: (item as { artwork?: string }).artwork ?? item.album?.thumb?.photo_300 ?? unknownTrackImageUri,
  }));

/**
 * Search the WHOLE Frisky group, not the page the app happens to hold.
 * VK has no "search inside this owner", so the backend keeps the group's
 * catalogue and filters it there.
 */
export const searchFriskyList = async (query: string, count: number = 100) => {
  const url = `${apiUrls.friskyListUrl}?count=${count}&offset=0&q=${encodeURIComponent(query)}`;
  console.info(`GET ${url}`);
  const data = await apiRequest(url, 'GET', {});
  return mapApiTracks(data?.items);
};

/**
 * Search the Favorites tab.
 *
 * Scoped to whatever the picker has selected. With `all` the backend also
 * returns `global`: matches from the rest of VK, which the screen shows under a
 * divider below the user's own tracks.
 */
export const searchFavorites = async (
  playlistId: string | number | undefined,
  query: string,
  count: number = 100,
): Promise<{items: any[]; global: any[]}> => {
  const filter = playlistId === undefined ? '' : `&playlist_id=${playlistId}`;
  const url = `${apiUrls.favoritesUrl}?count=${count}&offset=0${filter}&q=${encodeURIComponent(query)}`;
  console.info(`GET ${url}`);
  const data = await apiRequest(url, 'GET', {});
  return {
    items: mapApiTracks(data?.items),
    global: mapApiTracks(data?.global),
  };
};

export type VkProfile = {
  id: number
  first_name: string
  last_name: string
  screen_name: string
  photo: string
}

/** The four fields the Settings screen shows. See `GET /api/auth/me`. */
export const loadProfile = async (): Promise<VkProfile> => {
  return await apiRequest(apiUrls.meUrl, 'GET', {}) as VkProfile;
};

/** One page of the Frisky group, for the windowed list on the Songs tab. */
export const fetchFriskyPage = async (offset: number, count: number) => {
  const url = `${apiUrls.friskyListUrl}?count=${count}&offset=${offset}`;
  console.info(`GET ${url}`);
  const data = await apiRequest(url, 'GET', {});
  return mapApiTracks(data?.items);
};

/** One page of the selected favourites list. */
export const fetchFavoritesPage = async (
  playlistId: string | number | undefined,
  offset: number,
  count: number,
) => {
  const filter = playlistId === undefined ? '' : `&playlist_id=${playlistId}`;
  const url = `${apiUrls.favoritesUrl}?count=${count}&offset=${offset}${filter}`;
  console.info(`GET ${url}`);
  const data = await apiRequest(url, 'GET', {});
  return mapApiTracks(data?.items).map((item: any) => ({...item, favorite: item.favorite ?? true}));
};

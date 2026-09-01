import {apiUrls, headers} from "@/constants";
import {ensureDeviceId} from "@/helpers/device";
import {unknownTrackImageUri} from "@/constants/images";
import {TrackWithPlaylist} from "@/helpers/types";
import axios, {AxiosError, AxiosRequestConfig, Method} from "axios";
import {TrackType} from "react-native-track-player";
import {AuthFragments} from "@/types/auth";
import {PlaybackDeviceInfo, PlaybackState} from "@/types/playback";

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
    // A session stored before the app kept a device id has none. The provider
    // writes one back into the session, but that is a storage round trip — fill
    // the header straight away so even the very first playlist refresh or token
    // refresh of this launch identifies the device.
    if (!session.device_id) {
      void ensureDeviceId().then((id) => {
        if (authHeaders["x-auth-token"] === session.access_token) authHeaders["x-auth-device"] = id;
      });
    }
  } else {
    authHeaders = {};
  }
  console.debug("==setAuthHeaders:", Object.keys(authHeaders));
};

/** The id every request identifies this installation with. */
export const currentDeviceId = (): string | null => authHeaders["x-auth-device"] ?? null;

/**
 * Credential keys, and everything printed about a request goes through this.
 *
 * Metro's output is not ephemeral: it is scrollback, it gets redirected into
 * build log files, and it is what people paste into a bug report. A token
 * printed once is a token leaked — and `x-auth-secret` is worse than the token,
 * because the audio URL signature is md5(url + secret) and it does not expire
 * with the session.
 *
 * The match is on the key name, case-insensitively, so it catches `access_token`
 * whether it arrives in a header, a request body or a response.
 */
const SECRET_KEYS = new Set([
  "x-auth-token",
  "x-auth-secret",
  "access_token",
  "refresh_token",
  "secret",
  "password",
  "success_token",
  "push_token",
]);

/** Length is kept: "the token is there but wrong" and "there is no token" are
 *  different bugs, and masking to a constant makes them look identical. */
const mask = (value: unknown): string =>
  typeof value === "string" ? `«redacted ${value.length}»` : "«redacted»";

/**
 * A log-safe copy. Depth-capped because an axios config holds its adapter, its
 * transport and — after a response — a socket, and walking into those turns one
 * debug line into a page of noise.
 */
const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) ? mask(entry) : redact(entry, depth + 1);
  }
  return out;
};

const registerInterceptors = () => {
  console.log("registerAuth");
  axios.interceptors.request.use((config) => {
    console.log("axios.interceptors.request:", config.method, config.url);
    return config;
  }, (error) => {
    console.error("axios.interceptors.request error:", error);
    return Promise.reject(error);
  });

  axios.interceptors.response.use((response) => {
    console.log("axios.interceptors.response:", response.status, response.config?.url);
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
  console.debug("==apiRequest config:", redact(config));

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
      console.log("--->getAuth-response:", redact(data));
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
  console.debug("===refreshToken data:", redact(data));
  if (!data) return;
  return apiRequest(apiUrls.refreshUrl, 'POST', {data:data})
    .then((data) => {
      console.log("--->refreshToken-response:", redact(data));
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


// ===========================================================================
// CROSS-DEVICE PLAYBACK ("Connect")
//
// The socket in services/playbackSync is the live path; these are the cold
// ones — app start, and anything that has to work while the socket is down.
// ===========================================================================

/** The whole session: what is playing, where, and on which devices it could. */
export const loadPlaybackState = async (): Promise<{
  state: PlaybackState
  position_now_ms: number
  server_now_ms: number
  devices: PlaybackDeviceInfo[]
}> => {
  return await apiRequest(apiUrls.playerStateUrl, 'GET', {});
};

/** Register this device (and its wake-up push token) with the account. */
export const registerPlaybackDevice = async (device: {
  name?: string
  platform?: string
  app_version?: string
  push_token?: string
}): Promise<{devices: PlaybackDeviceInfo[]}> => {
  return await apiRequest(apiUrls.playerDevicesUrl, 'POST', {data: device});
};

/** Hand the sound to another device without a socket (fallback path). */
export const transferPlayback = async (
  toDeviceId: string,
  play?: boolean,
): Promise<{state: PlaybackState}> => {
  return await apiRequest(apiUrls.playerTransferUrl, 'POST', {
    data: {to_device_id: toDeviceId, ...(play === undefined ? {} : {play})},
  });
};

/**
 * Re-resolve a track by its VK ids.
 *
 * A transfer carries ids, never a url: VK signs the stream per session, so the
 * receiving device has to ask for its own copy.
 */
export const fetchTrackById = async (ownerId: number | string, id: number | string) => {
  const item = await apiRequest(`${apiUrls.playerTrackUrl}/${ownerId}/${id}`, 'GET', {});
  return {
    ...item,
    date: item?.date?.toString(),
    type: TrackType.HLS,
    album: item?.album?.title ?? 'Unknown Album',
    artwork: item?.artwork ?? item?.album?.thumb?.photo_300 ?? unknownTrackImageUri,
  };
};

// ---------------------------------------------------------------------------
// Pairing: handing this session to a screen that cannot log in on its own.
//
// These four do not go through `apiRequest`. Two of them are called from a
// SIGNED-OUT app — the browser waiting to be paired has no headers to send — and
// all four care about the status code rather than the body: 204 means "not yet",
// 410 means "that code is gone", and `apiRequest` collapses both into a thrown
// axios error with a red line in the log. Polling every 1.5s for three minutes
// would fill Metro's scrollback with them.
// ---------------------------------------------------------------------------

export interface PairTicket {
  pair_id: string;
  code: string;
  expires_in: number;
  name: string;
  platform: string;
}

/** Ask the API to hold a slot open for this screen. */
export const openPairing = async (name: string, platform: string): Promise<PairTicket> => {
  const response = await axios.post(apiUrls.pairUrl, {name, platform}, {headers});
  return response.data as PairTicket;
};

/** What the phone shows the user before it hands anything over. */
export const peekPairing = async (
  idOrCode: string,
): Promise<{name: string; platform: string} | null> => {
  const response = await axios.get(`${apiUrls.pairUrl}/${encodeURIComponent(idOrCode)}/peek`, {
    headers,
    validateStatus: (status) => status === 200 || status === 410 || status === 429,
  });
  return response.status === 200 ? response.data : null;
};

export type ClaimOutcome = 'ok' | 'expired' | 'taken' | 'refused';

/**
 * Fill that slot with this device's session.
 *
 * The credentials are not in the body: they ride in the `x-auth-*` headers every
 * other call already sends, and the API checks them against VK before parking
 * anything. `expiresIn` is the only thing worth stating explicitly — without it
 * the receiving screen has to guess the token's remaining life.
 */
export const claimPairing = async (
  idOrCode: string,
  expiresIn?: number,
): Promise<ClaimOutcome> => {
  const response = await axios.post(
    `${apiUrls.pairUrl}/${encodeURIComponent(idOrCode)}/claim`,
    expiresIn ? {expires_in: expiresIn} : {},
    {
      headers: {...headers, ...authHeaders},
      validateStatus: (status) => status < 500,
    },
  );

  if (response.status === 200) return 'ok';
  if (response.status === 409) return 'taken';
  if (response.status === 410) return 'expired';
  console.warn('==pair: claim refused', response.status, response.data);
  return 'refused';
};

/**
 * The waiting screen asking "yet?". `null` while nothing has arrived, the
 * session once it has — and the API forgets the slot on the way out, so this
 * answers exactly once.
 */
export const collectPairing = async (
  pairId: string,
): Promise<{state: 'pending'} | {state: 'gone'} | {state: 'session'; session: AuthFragments}> => {
  const response = await axios.get(`${apiUrls.pairUrl}/${encodeURIComponent(pairId)}`, {
    headers,
    validateStatus: (status) => status === 200 || status === 204 || status === 410,
  });

  if (response.status === 204) return {state: 'pending'};
  if (response.status === 410) return {state: 'gone'};

  const {access_token, secret, user_id, expires_in} = response.data ?? {};
  if (!access_token || !secret || !user_id) return {state: 'gone'};

  const session: AuthFragments = {access_token, secret, user_id: String(user_id)};
  if (Number.isFinite(expires_in) && expires_in > 0) {
    session.created = new Date();
    session.maxAge = expires_in * 1000;
    session.expires = new Date(Date.now() + expires_in * 1000);
  }
  return {state: 'session', session};
};

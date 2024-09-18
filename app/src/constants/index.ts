import * as Linking from 'expo-linking';
import { Href } from "expo-router";
import { Platform } from "react-native";
import { RepeatMode } from "react-native-track-player";

export const colors = {
  primary: '#fc3c44',
  background: '#000',
  text: '#fff',
  textMuted: '#9ca3af',
  textMutedDarker: '#606060',
  icon: '#fff',
  maximumTrackTintColor: 'rgba(255,255,255,0.4)',
  minimumTrackTintColor: 'rgba(255,255,255,0.6)',
}

export const modifiers = {
  text:(Platform.OS === "ios") ? 0 : 6,
  icons:(Platform.OS === "ios") ? 0 : 8,
  padding:(Platform.OS === "ios") ? 0 : 5,
}

export const size = {
  base: (Platform.OS === "ios") ? 0 : 18,
  image: (Platform.OS === "ios") ? 0 : 50,
}

export const fonts = {
  xs: 12 + modifiers.text,
  sm: 16 + modifiers.text,
  base: 20 + modifiers.text,
  lg: 24 + modifiers.text,
  weight: (Platform.OS === "ios") ? 500 : 600,
}


/*const {top, bottom , left, right} = useSafeAreaInsets()
export const screen = {
  top: top,
  bottom: bottom,
  left: left,
  right: right,
}*/

export const screenPadding = {
  horizontal: 24,
}

export interface IPlayerState {
  repeatMode?: RepeatMode
}

export const PlayerState: IPlayerState = {
  repeatMode: RepeatMode.Off,
}


// Routing
export const rootPage: Href<string> = Linking.createURL('/(tabs)') as `${string}:${string}`;
export const authPage: Href<string> = Linking.createURL('/(auth)/welcome') as `${string}:${string}`;
export const appPage: Href<string> = Linking.createURL('/(app)') as `${string}:${string}`;

// Application headers
export const headers = {
  "User-Agent": "ViskyApp/1.0",
  "accept": "*/*",
  "Content-Type": "application/json",
}
const _envDev = process.env.EXPO_PUBLIC_DEV || ''
export const __DEV = _envDev === "true" || false
let baseHost: string = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";

if (__DEV) {
  switch (Platform.OS) {
    case "android":
      baseHost = "http://10.0.2.2:3000";
      break;
    default:
      baseHost = "http://localhost:3000";
  }
}
const redirectUrl: string = '?redirect=' + baseHost;

const baseUrl: string = `${baseHost}/api`
const authUrl: string = `${baseUrl}/auth`
const playlistUrl: string = `${baseUrl}/playlist`
const playerUrl: string = `${baseUrl}/player`
export const apiUrls = {
  baseUrl: baseUrl,
  authUrl: authUrl,
  playlistUrl: playlistUrl,
  playerUrl: playerUrl,
  oAuthUrl: `${authUrl}/vk-oauth`,
  authAdminAppUrl: (__DEV) ? `${authUrl}/local${redirectUrl}` : `${authUrl}/vk`,
  authAdminAppUrl_: `${authUrl}/vk`,
  tokenUrl: `${authUrl}/token`,
  refreshUrl: `${authUrl}/refresh`,
  profileUrl: `${authUrl}/profile`,
  friskyListUrl: `${playlistUrl}/frisky`,
  favoritesListUrl: `${playlistUrl}/favorites`,
  songsListUrl: `${playlistUrl}/playlist`,
  eqUrl: `${playerUrl}/equaliser`,
  statusUrl: `${playerUrl}`,
}


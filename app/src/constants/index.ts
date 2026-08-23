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
  text:(Platform.OS === "ios") ? 0 : 8,
  icons:(Platform.OS === "ios") ? 0 : 8,
  padding:(Platform.OS === "ios") ? 0 : 5,
  margin:(Platform.OS === "ios") ? 0 : 25,
  width:(Platform.OS === "ios") ? 0 : 10,
  height:(Platform.OS === "ios") ? 0 : 10,
  image:(Platform.OS === "ios") ? 0 : 20,
  scroll:(Platform.OS === "ios") ? 0 : 60,
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
export const rootPage: Href = Linking.createURL('/(tabs)') as `${string}:${string}`;
export const authPage: Href = Linking.createURL('/(auth)/welcome') as `${string}:${string}`;
export const appPage: Href = Linking.createURL('/(app)') as `${string}:${string}`;

// Application headers
export const headers = {
  "User-Agent": "ViskyApp/1.0",
  "accept": "*/*",
  "Content-Type": "application/json",
}
const _envDev = process.env.EXPO_PUBLIC_DEV || __DEV__
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

export const baseUrl: string = `${baseHost}/api`
const authUrl: string = `${baseUrl}/auth`
const playlistUrl: string = `${baseUrl}/playlist`
const playerUrl: string = `${baseUrl}/player`
export const apiUrls = {
  baseUrl: baseUrl,
  authUrl: authUrl,
  playlistUrl: playlistUrl,
  playerUrl: playerUrl,
  oAuthUrl: `${authUrl}/vk-oauth`,
  authAppUrl: (__DEV) ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk`,
  authFallbackUrl: (__DEV) ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk/fallback`,
  // After the user solves VK's real captcha, VK lands on blank.html?success=1;
  // the WebView loads this to retry the grant (same device_id) and get the token.
  authResumeUrl: (__DEV) ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk/resume`,
  authAdminAppUrl_: `${authUrl}/vk`,
  directUrl: `${authUrl}/direct`,
  tokenUrl: `${authUrl}/token`,
  refreshUrl: `${authUrl}/refresh`,
  profileUrl: `${authUrl}/profile`,
  friskyListUrl: `${playlistUrl}/frisky`,
  playListUrl: `${playlistUrl}/playlist`,
  eqUrl: `${playerUrl}/equaliser`,
  statusUrl: `${playerUrl}`,
}


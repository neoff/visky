import * as Linking from 'expo-linking';
import { Href } from "expo-router";
import { Platform } from "react-native";
import { RepeatMode } from "react-native-track-player";

export const colors = {
  primary: '#fc3c44',
  background: '#000',
  // Shared translucent plate colour for the tab bar, the mini player and the
  // search header. It is an explicit rgba value rather than a BlurView: expo-blur
  // renders at a different translucency on Android (dimezisBlurView) than on iOS,
  // which is what made the two builds look unequal. rgba keeps the see-through
  // look and is identical on both platforms.
  surface: 'rgba(32,32,32,0.82)',
  surfaceHeader: 'rgba(10,10,10,0.82)',
  // Seam between the mini player and the tab icons: LIGHTER than the plate and
  // painted ON it, so it composites over the plate instead of punching a hole
  // through both plates (a transparent line would show the list underneath).
  surfaceDivider: 'rgba(255,255,255,0.22)',
  text: '#fff',
  textMuted: '#9ca3af',
  textMutedDarker: '#606060',
  icon: '#fff',
  maximumTrackTintColor: 'rgba(255,255,255,0.4)',
  minimumTrackTintColor: 'rgba(255,255,255,0.6)',
}

// iOS and Android must render identically: no per-platform size/spacing offsets.
// The keys are kept so the existing `x + modifiers.y` call sites keep compiling.
export const modifiers = {
  text: 0,
  icons: 0,
  padding: 0,
  margin: 0,
  width: 0,
  height: 0,
  image: 0,
  scroll: 0,
}

export const size = {
  base: 0,
  image: 0,
}

// Shared layout metrics. The tab bar, the mini player and the search header all
// derive their geometry from here so the two platforms stay in sync and the
// mini player sits flush on top of the tab bar.
export const layout = {
  // tab bar height WITHOUT the bottom safe-area inset
  tabBarContentHeight: 60,
  tabBarRadius: 20,
  // mini player: fixed so it is exactly as tall as the tab bar plate
  floatingPlayerHeight: 60,
  // one icon size for every tab, so the icon row has a single baseline
  tabIconSize: 24,
  searchBoxHeight: 48,
  // search header height WITHOUT the top safe-area inset
  headerContentHeight: 130,
}

export const fonts = {
  xs: 12 + modifiers.text,
  sm: 16 + modifiers.text,
  base: 20 + modifiers.text,
  lg: 24 + modifiers.text,
  // identical on both platforms — a heavier Android weight renders visibly bigger
  weight: 600,
}


/*const {top, bottom , left, right} = useSafeAreaInsets()
export const screen = {
  top: top,
  bottom: bottom,
  left: left,
  right: right,
}*/

export const screenPadding = {
  // halved (was 24): the rows sat too far from the screen edges
  horizontal: 12,
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
// Use the offline /auth/local mock instead of the real VK login. Only vars
// prefixed EXPO_PUBLIC_ are inlined into the bundle by Expo, so
// EXPO_PUBLIC_LOGIN_LOCAL is the one that actually works; EXPO_LOGIN_LOCAL is
// accepted too but Expo will not expose it to the app.
export const loginLocal =
  __DEV && (process.env.EXPO_PUBLIC_LOGIN_LOCAL || process.env.EXPO_LOGIN_LOCAL) === "true"
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
  // Real VK login by default. `baseHost` already points at the local API in dev
  // (10.0.2.2:3000 on Android), so dev exercises the SAME VK login page, grant
  // and captcha — just against localhost.
  //
  // Set EXPO_PUBLIC_LOGIN_LOCAL=true to use `/auth/local` instead: an OFFLINE
  // MOCK that never contacts VK — it ignores the credentials and redirects to a
  // canned DEV_API_TOKEN. That is why it "logged in" any account with an
  // identical token/secret and never asked for 2FA. Useful only for exercising
  // the app-side hash capture; keep it false to test the real flow.
  authAppUrl: loginLocal ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk`,
  authFallbackUrl: loginLocal ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk/fallback`,
  // After the user solves VK's real captcha, VK lands on blank.html?success=1;
  // the WebView loads this to retry the grant (same device_id) and get the token.
  authResumeUrl: loginLocal ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk/resume`,
  // Where the WebView hands VK's raw grant JSON back after performing the grant
  // itself (the backend 302s it to oauth.vk.com/token so the request leaves from
  // the phone's IP, which VK does not challenge — the cluster's IP always is).
  authNextUrl: loginLocal ? `${baseHost}/auth/local${redirectUrl}` : `${baseHost}/auth/vk/next`,
  // Same handoff for the 2FA code resend, which VK also refuses from the server.
  authValidateNextUrl: loginLocal
    ? `${baseHost}/auth/local${redirectUrl}`
    : `${baseHost}/auth/vk/validate-next`,
  authAdminAppUrl_: `${authUrl}/vk`,
  directUrl: `${authUrl}/direct`,
  tokenUrl: `${authUrl}/token`,
  refreshUrl: `${authUrl}/refresh`,
  profileUrl: `${authUrl}/profile`,
  meUrl: `${authUrl}/me`,
  friskyListUrl: `${playlistUrl}/frisky`,
  // NOTE: `${playlistUrl}/playlist` used to be here — /api/playlist/playlist is
  // not a route, so the Favorites tab 404'd on every refresh and stayed empty.
  playListUrl: `${playlistUrl}`,
  favoritesUrl: `${playlistUrl}/frisky/favorites`,
  playlistsUrl: `${playlistUrl}/frisky/playlists`,
  createFavoritesUrl: `${playlistUrl}/frisky/create-favorites`,
  eqUrl: `${playerUrl}/equaliser`,
  statusUrl: `${playerUrl}`,
}


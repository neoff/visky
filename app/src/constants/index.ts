import * as Linking from 'expo-linking';
import {Href} from "expo-router";

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

export const fontSize = {
  xs: 12,
  sm: 16,
  base: 20,
  lg: 24,
}

export const screenPadding = {
  horizontal: 24,
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

const baseHost: string = (__DEV__?process.env.EXPO_LOCAL_API_URL:process.env.EXPO_PUBLIC_API_URL) || "http://localhost:3000";

const baseUrl: string =  `${baseHost}/api`
const authUrl: string =  `${baseUrl}/auth`
const playlistUrl: string =  `${baseUrl}/playlist`
const playerUrl: string =  `${baseUrl}/player`
export const apiUrls = {
  baseUrl: baseUrl,
  authUrl: authUrl,
  playlistUrl: playlistUrl,
  playerUrl: playerUrl,
  oAuthUrl: `${authUrl}/vk-oauth`,
  authAdminAppUrl: __DEV__?`${authUrl}/local`:`${authUrl}/vk`,
  tokenUrl: `${authUrl}/token`,
  refreshUrl: `${authUrl}/refresh`,
  profileUrl: `${authUrl}/profile`,
  friskyListUrl: `${playlistUrl}/frisky`,
  favoritesListUrl: `${playlistUrl}/favorites`,
  eqUrl: `${playerUrl}/equaliser`,
  statusUrl: `${playerUrl}`,
}


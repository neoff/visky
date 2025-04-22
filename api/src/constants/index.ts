import { StrategyOptions as VkStrategyOptions } from "passport-vkontakte";

export const vk: VkStrategyOptions & { 
                                        authorizationURL?:string, 
                                        tokenURL?:string, 
                                        response_type: string, 
                                        revoke: string 
    } = {
    clientID: process.env.VK_APP_ID ?? '',
    clientSecret: process.env.VK_APP_SECRET ?? '',
    callbackURL: 'https://oauth.vk.com/blank.html',
    //callbackURL: 'http://localhost:3000/auth/vk/callback',
    response_type: 'token',
    revoke: '1',
};

export const spotify = {
    clientID: 'PASTE_CLIENT_ID_HERE',
    clientSecret: 'PASTE_CLIENT_SECRET_HERE',
    callbackURL: 'http://localhost:3000/auth/github/callback',
};

export const alphabet = "abcdefghijklmnopqrstuvwxyz0987654321"
const v1="5.95"
export const version = "5.103"

// API urls
const baseHost: string = process.env.EXPO_PUBLIC_API_URL || "https://localhost:3000";
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
  authAdminAppUrl: `${authUrl}/vk`,
  authLocalAppUrl: `${authUrl}/local`,
  tokenUrl: `${authUrl}/token`,
  refreshUrl: `${authUrl}/refresh`,
  profileUrl: `${authUrl}/profile`,
  friskyListUrl: `${playlistUrl}/frisky`,
  favoritesListUrl: `${playlistUrl}/favorites`,
  eqUrl: `${playerUrl}/equaliser`,
  statusUrl: `${playerUrl}`,
}

export default { vk, spotify};
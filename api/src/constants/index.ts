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

/**
 * Direct token grant (password grant) app credentials.
 * VK ID web-OAuth never returns `secret` and has no `audio` scope, so audio
 * access requires emulating a legacy audio-capable app via oauth.vk.com/token.
 * client_id and client_secret MUST be a matching pair (else invalid_client).
 * Configurable via env; defaults to Kate Mobile (most reliable for audio).
 */
export const directGrant = {
  appId: process.env.VK_DIRECT_APP_ID
    || process.env.OFFICIAL_APP_ID
    || process.env.VK_ADMIN_ID
    || "2685278", // Kate Mobile
  appSecret: process.env.VK_DIRECT_APP_SECRET
    || process.env.OFFICIAL_APP_SECRET
    || "lxhD8OD7dMsqtXIm5IUY", // Kate Mobile
  scope: process.env.VK_DIRECT_SCOPE || "nohttps,audio,offline",
  // User-Agent used for the token request; Kate Mobile UA pairs with its app id.
  userAgent: process.env.VK_DIRECT_UA
    || "KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)",
}


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
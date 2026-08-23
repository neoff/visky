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
 *
 * Default = VK Android (2274003). Kate Mobile (2685278) is heavily abused and
 * its client is globally rate-limited: the password grant returns 9;Flood
 * control even from a clean IP with correct creds. VK Android is not throttled
 * that way (verified 2026-08-23: 2274003 -> 200 + token + secret + working
 * audio.get, while 2685278 flooded with the SAME creds from the same IP in the
 * same second). Override via VK_DIRECT_* env only — no OFFICIAL_APP_ID/
 * VK_ADMIN_ID fallbacks (VK_ADMIN_ID 6121396 is a blocked app; OFFICIAL_APP_ID
 * silently forced the flooded Kate pair when set).
 */
export const directGrant = {
  appId: process.env.VK_DIRECT_APP_ID || "2274003", // VK Android (audio-capable, not rate-limited)
  appSecret: process.env.VK_DIRECT_APP_SECRET || "hHbZxrka2uZ6jB1inYsH",
  scope: process.env.VK_DIRECT_SCOPE || "nohttps,audio,offline",
  // User-Agent MUST pair with the app id (VK Android UA for the VK Android app).
  userAgent: process.env.VK_DIRECT_UA
    || "VKAndroidApp/7.7-9034 (Android 12; SDK 31; arm64-v8a; ru)",
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
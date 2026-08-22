// src/helper/directGrant.ts
// Shared VK direct password grant (legacy Android app emulation). This is the
// ONLY path that yields an audio-capable access_token + signing `secret`
// (VK ID web-OAuth returns neither). Used by both the JSON endpoint
// (/api/auth/direct) and the webview HTML fallback flow (/auth/vk/fallback).
import axios from "axios";
import {TokenUrl, deviceIDgen} from ".";
import {directGrant} from "@/constants";

// A COOKIELESS client for the token grant. The shared AndroidClient is wrapped
// with a cookie jar and accumulates VK anti-fraud/session cookies across the
// process's many audio calls; sending those on the password grant makes VK see
// an established "session" and apply stricter bruteforce/flood throttling.
// A fresh cookieless request looks like a clean device and is NOT flood-locked
// (verified 2026-08-22: identical params flood via AndroidClient but succeed via
// a cookieless request within the same second).
const grantClient = axios.create();

// Grant API version is INDEPENDENT of the global `version` (5.103) used for
// audio signing. Old versions (5.103) make oauth.vk.com/token demand a captcha
// on password grant, which then trips flood control; 5.131+ returns the token
// directly. Kept overridable via env.
const grantVersion = process.env.VK_DIRECT_V || "5.131";

export type GrantInput = {
  login: string;
  password: string;
  code?: string;
  captcha_sid?: string;
  captcha_key?: string;
  device_id?: string;
};

export type GrantResult =
  | {kind: "ok"; access_token: string; secret: string; user_id: string; device_id: string}
  | {kind: "need_validation"; validation_type?: string; phone_mask?: string; validation_sid?: string; device_id: string}
  | {kind: "need_captcha"; captcha_sid: string; captcha_img: string; device_id: string}
  | {kind: "error"; message: string; raw?: any};

/**
 * Perform a single direct password grant attempt against oauth.vk.com/token.
 * device_id MUST stay stable across the 2FA/captcha retry and later audio
 * signing (it is part of md5(url+secret)); callers pass the returned device_id
 * back in on the follow-up attempt.
 */
export async function performDirectGrant(input: GrantInput): Promise<GrantResult> {
  const device_id: string = input.device_id || deviceIDgen();

  const params: Record<string, string> = {
    grant_type: "password",
    client_id: directGrant.appId,
    client_secret: directGrant.appSecret,
    username: input.login,
    password: input.password,
    scope: directGrant.scope,
    "2fa_supported": "1",
    v: grantVersion,
    device_id,
    lang: "en",
  };
  // NOTE: do NOT send force_sms=1 on the first attempt. It forces VK into the
  // SMS-2FA flow and repeated forced sends trip the bruteforce/flood protection
  // (password_bruteforce_attempt). Without it a password-only account returns
  // the token immediately; VK still replies need_validation on its own when the
  // account genuinely requires 2FA, and we resend with `code` then.
  if (input.code) params.code = String(input.code);
  if (input.captcha_sid) params.captcha_sid = String(input.captcha_sid);
  if (input.captcha_key) params.captcha_key = String(input.captcha_key);

  // DEV debug: which app pair + scope is used for the grant (diagnoses
  // "client_secret is incorrect" = mismatched app_id/secret pair).
  console.log("=====> direct grant request:", {
    client_id: directGrant.appId,
    client_secret: directGrant.appSecret,
    scope: directGrant.scope,
    v: grantVersion,
    username: input.login,
    device_id,
    ua: directGrant.userAgent,
  });

  const response = await grantClient.get(TokenUrl, {
    params,
    headers: {"User-Agent": directGrant.userAgent},
    validateStatus: () => true, // VK returns 401 with JSON body for challenges
  });
  const data: any = response.data || {};
  console.log("<===== direct grant response:", JSON.stringify(data).slice(0, 300));

  if (data.access_token) {
    return {
      kind: "ok",
      access_token: data.access_token,
      secret: data.secret || "",
      user_id: data.user_id?.toString() || "",
      device_id,
    };
  }
  if (data.error === "need_validation") {
    return {
      kind: "need_validation",
      validation_type: data.validation_type,
      phone_mask: data.phone_mask,
      validation_sid: data.validation_sid,
      device_id,
    };
  }
  if (data.error === "need_captcha") {
    return {
      kind: "need_captcha",
      captcha_sid: data.captcha_sid,
      captcha_img: data.captcha_img,
      device_id,
    };
  }
  return {
    kind: "error",
    message: data.error_description || data.error || "Authentication failed",
    raw: data,
  };
}

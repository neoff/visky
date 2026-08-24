// src/helper/directGrant.ts
// Shared VK direct password grant (legacy Android app emulation). This is the
// ONLY path that yields an audio-capable access_token + signing `secret`
// (VK ID web-OAuth returns neither). Used by both the JSON endpoint
// (/api/auth/direct) and the webview HTML fallback flow (/auth/vk/fallback).
import * as http2 from "http2";
import {TokenUrl, deviceIDgen} from ".";
import {directGrant} from "@/constants";

// !!! THE GRANT MUST GO OVER HTTP/2 !!!
// VK's anti-bot on oauth.vk.com/token HARD-floods HTTP/1.1 requests
// (`9;Flood control` / `password_bruteforce_attempt`) but only soft-challenges
// HTTP/2 requests (`need_captcha`, which is recoverable). Node's axios and the
// `https` module speak HTTP/1.1, so an axios-based grant floods on EVERY attempt
// even with correct creds, the right app pair, and a clean IP. This is NOT an
// IP or account rate-limit — it is a protocol/fingerprint check.
// Proven 2026-08-23 from one machine, same creds, within the same second:
//   curl --http1.1  -> 9;Flood control        (hard)
//   curl --http2    -> need_captcha / token    (soft, passes)
//   node axios/https-> 9;Flood control         (HTTP/1.1, hard)
//   node http2      -> need_captcha / token    (soft, passes)
// So we issue the grant with the native `http2` module. Do NOT swap this back to
// axios/got/https or the flood returns.

// Grant API version is INDEPENDENT of the global `version` (5.103) used for
// audio signing. Old versions (5.103) make oauth.vk.com/token demand a captcha
// on password grant; 5.131+ returns the token directly. Kept overridable.
const grantVersion = process.env.VK_DIRECT_V || "5.131";

// Minimal HTTP/2 GET. VK returns a JSON body even on 401 (challenges), so we
// always parse the body regardless of status.
function h2GetJson(
  origin: string,
  path: string,
  headers: Record<string, string>,
  timeoutMs = 20000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(origin);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {}
      fn();
    };
    client.on("error", (e) => finish(() => reject(e)));

    const req = client.request({":method": "GET", ":path": path, ...headers});
    req.setEncoding("utf8");
    req.setTimeout(timeoutMs, () => finish(() => reject(new Error("grant request timeout"))));
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("error", (e) => finish(() => reject(e)));
    req.on("end", () =>
      finish(() => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({error: "parse_error", error_description: data.slice(0, 200)});
        }
      }),
    );
    req.end();
  });
}

export type GrantInput = {
  login: string;
  password: string;
  code?: string;
  captcha_sid?: string;
  captcha_key?: string;
  // not_robot proof. VK's interactive captcha ("not_robot") is redeemed on the
  // token endpoint with captcha_sid (the ORIGINAL from the need_captcha reply)
  // PLUS `success_token` — NOT `captcha_key` (that's only for the legacy image
  // captcha). Sending captcha_key with a not_robot token just re-challenges.
  // Proven 2026-08-23: captcha_sid + success_token -> access_token + secret.
  success_token?: string;
  device_id?: string;
};

export type GrantResult =
  | {kind: "ok"; access_token: string; secret: string; user_id: string; device_id: string}
  | {
      kind: "need_validation"
      // `2fa_callreset` (code = last 4 digits of an INCOMING CALL — no SMS is
      // sent at all), `2fa_sms`, `2fa_app`, ...
      validation_type?: string
      phone_mask?: string
      validation_sid?: string
      // VK's own wording, e.g. "use last 4 digits from incoming call"
      description?: string
      // Channel a resend would switch to (e.g. "sms")
      validation_resend?: string
      device_id: string
    }
  | {kind: "need_captcha"; captcha_sid: string; captcha_img: string; redirect_uri?: string; device_id: string}
  // VK dresses a blocked account up as `need_validation` and only the presence of
  // `ban_info` tells the two apart. Rendering the code form for it asks the user
  // for a code that will never arrive, so it gets its own result.
  | {kind: "banned"; message: string; member_name?: string; device_id: string}
  | {kind: "error"; message: string; raw?: any};

/**
 * Build the exact token-endpoint URL for a grant attempt.
 *
 * Split out of performDirectGrant because the grant no longer always runs here:
 * VK hands out `need_captcha` on EVERY attempt from the cluster's egress IP
 * (captcha_ratio 2.6), while the SAME credentials from a residential IP get an
 * access_token straight away, in the same second. So the app's WebView navigates
 * to this URL itself — the request then leaves from the phone's IP over HTTP/2
 * and VK never challenges it. Verified 2026-08-24 from inside the pod vs a dev
 * machine, both accounts. The UA does NOT matter (a plain Chrome-mobile UA gets
 * a token too), so the WebView needs no UA override.
 */
export function buildGrantUrl(input: GrantInput): {url: string; device_id: string} {
  const device_id: string = input.device_id || deviceIDgen();
  const qp = grantParams(input, device_id);
  const u = new URL(TokenUrl);
  return {url: `${u.origin}${u.pathname}?${qp.toString()}`, device_id};
}

function grantParams(input: GrantInput, device_id: string): URLSearchParams {
  const qp = new URLSearchParams({
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
  });
  // NOTE: do NOT send force_sms=1 on the first attempt. It forces VK into the
  // SMS-2FA flow and repeated forced sends trip the bruteforce/flood protection
  // (password_bruteforce_attempt). Without it a password-only account returns
  // the token immediately; VK still replies need_validation on its own when the
  // account genuinely requires 2FA, and we resend with `code` then.
  if (input.code) qp.set("code", String(input.code));
  if (input.captcha_sid) qp.set("captcha_sid", String(input.captcha_sid));
  // not_robot: captcha_sid + success_token (the winning combo). Legacy image
  // captcha still uses captcha_key. Never send both for one challenge.
  if (input.success_token) qp.set("success_token", String(input.success_token));
  else if (input.captcha_key) qp.set("captcha_key", String(input.captcha_key));
  return qp;
}

/**
 * Perform a single direct password grant attempt against oauth.vk.com/token.
 * device_id MUST stay stable across the 2FA/captcha retry and later audio
 * signing (it is part of md5(url+secret)); callers pass the returned device_id
 * back in on the follow-up attempt.
 */
export async function performDirectGrant(input: GrantInput): Promise<GrantResult> {
  const device_id: string = input.device_id || deviceIDgen();
  const qp = grantParams(input, device_id);

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
    proto: "h2",
  });

  const u = new URL(TokenUrl); // https://oauth.vk.com/token
  let data: any = {};
  try {
    data = await h2GetJson(u.origin, `${u.pathname}?${qp.toString()}`, {
      "user-agent": directGrant.userAgent,
      accept: "*/*",
    });
  } catch (e: any) {
    console.error("======> grant transport ERROR:", e?.message);
    return {kind: "error", message: e?.message || "Grant request failed"};
  }
  console.log("<===== direct grant response:", JSON.stringify(data).slice(0, 300));
  return parseGrantResponse(data, device_id);
}

/**
 * Turn VK's token-endpoint JSON into a GrantResult. Shared by the server-side
 * grant and by /auth/vk/next, which receives the very same JSON read out of the
 * WebView after the phone performed the grant itself.
 */
export function parseGrantResponse(data: any, device_id: string): GrantResult {
  if (data.access_token) {
    return {
      kind: "ok",
      access_token: data.access_token,
      secret: data.secret || "",
      user_id: data.user_id?.toString() || "",
      device_id,
    };
  }
  if (data.ban_info) {
    return {
      kind: "banned",
      message: data.ban_info.message || data.error_description || "Аккаунт заблокирован",
      member_name: data.ban_info.member_name,
      device_id,
    };
  }
  if (data.error === "need_validation") {
    return {
      kind: "need_validation",
      validation_type: data.validation_type,
      phone_mask: data.phone_mask,
      validation_sid: data.validation_sid,
      description: data.error_description,
      validation_resend: data.validation_resend,
      device_id,
    };
  }
  if (data.error === "need_captcha") {
    return {
      kind: "need_captcha",
      captcha_sid: data.captcha_sid,
      captcha_img: data.captcha_img,
      // The real interactive VK captcha ("not_robot"). captcha_img is dead for
      // source=api-oauth (302 -> image_not_supported). redirect_uri renders the
      // solvable widget; with &blank=1 it navigates to
      // https://oauth.vk.com/blank.html?success=1 on success.
      redirect_uri: data.redirect_uri,
      device_id,
    };
  }
  return {
    kind: "error",
    message: data.error_description || data.error || "Authentication failed",
    raw: data,
  };
}

/**
 * Ask VK to re-send the 2FA challenge for an in-flight validation session.
 *
 * VK does NOT always use SMS: for `2fa_callreset` it places a flash call and the
 * code is the last 4 digits of the CALLING number, so waiting for an SMS is
 * pointless. `validation_resend` in the grant reply names the channel a resend
 * switches to, and the reply here carries `delay` — seconds VK wants us to wait
 * before it will actually re-deliver (calling earlier just returns the same
 * countdown). Returns whatever VK reports so the UI can show a real timer.
 */
/**
 * Query string for auth.validatePhone, for when the resend has to run on the
 * DEVICE. Same reason as buildGrantUrl: from the cluster's IP VK answers this
 * with "Captcha needed" (seen live on the 2FA page), from a phone it just works.
 * api.vk.com sends no Access-Control-Allow-Origin but DOES support JSONP, so the
 * app appends &callback= and loads it as a script.
 */
export function buildValidateResendQuery(sid: string): string {
  return new URLSearchParams({
    sid,
    client_id: directGrant.appId,
    client_secret: directGrant.appSecret,
    v: grantVersion,
    lang: "ru",
  }).toString();
}

/** Shape auth.validatePhone's JSON into what the 2FA page needs to re-render. */
export function parseValidateResend(data: any): {
  validation_type?: string;
  validation_resend?: string;
  delay?: number;
  error?: string;
} {
  if (data?.response) {
    return {
      validation_type: data.response.validation_type,
      validation_resend: data.response.validation_resend,
      delay: data.response.delay,
    };
  }
  return {error: data?.error?.error_msg || data?.error || "resend failed"};
}

export async function requestValidationResend(
  sid: string,
): Promise<{validation_type?: string; validation_resend?: string; delay?: number; error?: string}> {
  const qp = buildValidateResendQuery(sid);
  try {
    const data = await h2GetJson("https://api.vk.com", `/method/auth.validatePhone?${qp}`, {
      "user-agent": directGrant.userAgent,
      accept: "*/*",
    });
    console.log("<===== validatePhone:", JSON.stringify(data).slice(0, 200));
    return parseValidateResend(data);
  } catch (e: any) {
    console.error("======> validatePhone ERROR:", e?.message);
    return {error: e?.message || "resend failed"};
  }
}

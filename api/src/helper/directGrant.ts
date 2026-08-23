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
  if (input.captcha_key) qp.set("captcha_key", String(input.captcha_key));

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

// src/services/session.ts
//
// The WebSocket has no cookie and no express-session, so it authenticates with
// the same `x-auth-*` headers the REST calls carry. Unlike REST — where every
// call is proxied to VK, and a forged user id therefore buys nothing — the
// playback state is OURS: a socket claiming someone else's user id would read
// and steer their session. So the token is checked against VK once per
// connection and the answer is cached.
import {vkMethod} from "@/helper/vk";
import {Request} from "@/types";

interface Verified {
  user_id: string;
  at: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, Verified>();

export interface SocketCredentials {
  token: string;
  user_id: string;
  secret?: string;
  device_id?: string;
}

const trustHeaders = /^(1|true|yes|on)$/i.test(process.env.PLAYBACK_TRUST_HEADERS ?? "");

/**
 * Resolve the VK user behind a token. Returns null when VK rejects it, or when
 * it belongs to a different account than the one claimed.
 */
export const verifyCredentials = async (creds: SocketCredentials): Promise<string | null> => {
  if (!creds.token || !creds.user_id) return null;
  if (trustHeaders) return creds.user_id;

  const cached = cache.get(creds.token);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.user_id === creds.user_id ? cached.user_id : null;
  }

  // vkMethod reads the credentials off a request's session; a socket has none,
  // so it gets a stand-in carrying exactly the fields the signature needs.
  const stub = {
    session: {
      access_token: creds.token,
      secret: creds.secret,
      device_id: creds.device_id,
      user_id: creds.user_id,
    },
  } as unknown as Request;

  try {
    const response: any = await vkMethod(stub, "users.get", {});
    const id = response?.response?.[0]?.id;
    if (!id) return null;
    const resolved = String(id);
    cache.set(creds.token, {user_id: resolved, at: Date.now()});
    return resolved === creds.user_id ? resolved : null;
  } catch (error) {
    console.error("==playback: token verification failed:", (error as Error)?.message ?? error);
    return null;
  }
};

/** Tests only. */
export const __resetSessionCache = (): void => cache.clear();

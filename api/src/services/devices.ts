// src/services/devices.ts
//
// Who owns which device, and which of them can be reached right now.
//
// The durable half lives in Postgres (users/devices); the volatile half —
// "is there a socket open on it" — is per-process and rebuilt on every connect.
// With no DB configured everything stays in memory, which is enough for a single
// replica and for the tests.
import {initDataSource} from "@/configurations/typeorm.config";
import {playback} from "@/configurations/playback";
import {Device} from "@/db/entities/Device";
import {User} from "@/db/entities/User";
import {PlaybackDeviceInfo} from "@/types/playback";

interface DeviceRow {
  device_id: string;
  user_id: string;
  name: string | null;
  platform: string | null;
  app_version: string | null;
  push_token: string | null;
  last_seen_ms: number | null;
  /** set once the account signed this installation out; see the migration */
  revoked_at: number | null;
  /** when this row was last read from or written to Postgres */
  checked_at: number;
  /** a live socket on THIS process */
  connected: boolean;
}

/**
 * How stale a "not revoked" answer may be.
 *
 * The revoke is written by whichever replica served the button press, and the
 * cache above is per replica: another one holding the doomed device's socket
 * would keep believing it. Rather than a second Kafka topic for one boolean,
 * the negative answer simply expires — a revoked device is cut off within this
 * long wherever it is connected, and the positive answer never expires because
 * revocation does not un-happen.
 *
 * Costs one primary-key read per device per window, on requests that are
 * already talking to VK over the network.
 */
const REVOKED_RECHECK_MS = 30_000;

/** user_id -> device_id -> row */
const cache = new Map<string, Map<string, DeviceRow>>();
/** users whose rows have already been pulled from Postgres */
const loaded = new Set<string>();

const bucket = (userId: string): Map<string, DeviceRow> => {
  let b = cache.get(userId);
  if (!b) {
    b = new Map();
    cache.set(userId, b);
  }
  return b;
};

const persist = async (row: DeviceRow): Promise<void> => {
  const ds = await initDataSource();
  if (!ds) return;
  try {
    await ds.getRepository(User).upsert({id: row.user_id}, ["id"]);
    await ds.getRepository(Device).upsert(
      {
        id: row.device_id,
        userId: row.user_id,
        name: row.name,
        platform: row.platform,
        appVersion: row.app_version,
        pushToken: row.push_token,
        lastSeen: row.last_seen_ms ? new Date(row.last_seen_ms) : null,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      },
      ["id"],
    );
  } catch (error) {
    console.error("==playback: could not persist device:", (error as Error)?.message ?? error);
  }
};

/** Pull a user's devices from Postgres once, so other replicas' devices show up too. */
const hydrate = async (userId: string): Promise<void> => {
  if (loaded.has(userId)) return;
  loaded.add(userId);
  const ds = await initDataSource();
  if (!ds) return;
  try {
    const rows = await ds.getRepository(Device).find({where: {userId}});
    const b = bucket(userId);
    for (const row of rows) {
      if (b.has(row.id)) continue; // a live row always wins over the stored one
      b.set(row.id, {
        device_id: row.id,
        user_id: userId,
        name: row.name ?? null,
        platform: row.platform ?? null,
        app_version: row.appVersion ?? null,
        push_token: row.pushToken ?? null,
        last_seen_ms: row.lastSeen ? row.lastSeen.getTime() : null,
        revoked_at: row.revokedAt ? row.revokedAt.getTime() : null,
        checked_at: Date.now(),
        connected: false,
      });
    }
  } catch (error) {
    console.error("==playback: could not load devices:", (error as Error)?.message ?? error);
  }
};

export interface DeviceIdentity {
  device_id: string;
  name?: string | null;
  platform?: string | null;
  app_version?: string | null;
  push_token?: string | null;
}

/** Record that we just heard from a device (socket frame, REST call, push ack). */
export const touchDevice = async (
  userId: string,
  identity: DeviceIdentity,
  connected?: boolean,
): Promise<DeviceRow> => {
  await hydrate(userId);
  const b = bucket(userId);
  const existing = b.get(identity.device_id);
  const row: DeviceRow = {
    device_id: identity.device_id,
    user_id: userId,
    name: identity.name ?? existing?.name ?? null,
    platform: identity.platform ?? existing?.platform ?? null,
    app_version: identity.app_version ?? existing?.app_version ?? null,
    push_token: identity.push_token ?? existing?.push_token ?? null,
    last_seen_ms: Date.now(),
    // Carried, never cleared. `touchDevice` runs on almost every request, and
    // dropping it here would let a revoked device un-revoke itself simply by
    // asking for something.
    revoked_at: existing?.revoked_at ?? null,
    checked_at: existing?.checked_at ?? Date.now(),
    connected: connected ?? existing?.connected ?? false,
  };
  b.set(row.device_id, row);
  await persist(row);
  return row;
};

export const setConnected = (userId: string, deviceId: string, connected: boolean): void => {
  const row = bucket(userId).get(deviceId);
  if (!row) return;
  row.connected = connected;
  row.last_seen_ms = Date.now();
};

export const getPushToken = async (userId: string, deviceId: string): Promise<string | null> => {
  await hydrate(userId);
  return bucket(userId).get(deviceId)?.push_token ?? null;
};

/**
 * Everything the picker needs.
 *
 * `online` is deliberately strict: a socket on this process, or a device seen
 * within `deviceTimeoutMs` (so a device held by another replica still shows).
 * Anything older is offline and can only be woken by a push — which is a hint,
 * not a promise, so the app greys it out.
 */
export const listDevices = async (
  userId: string,
  activeDeviceId: string | null,
): Promise<PlaybackDeviceInfo[]> => {
  await hydrate(userId);
  const now = Date.now();
  return [...bucket(userId).values()]
    .filter((row) => row.revoked_at === null)
    .map((row) => ({
      device_id: row.device_id,
      name: row.name,
      platform: row.platform,
      app_version: row.app_version,
      online: row.connected || (row.last_seen_ms !== null && now - row.last_seen_ms < playback.deviceTimeoutMs),
      is_active: row.device_id === activeDeviceId,
      last_seen_ms: row.last_seen_ms,
      can_wake: Boolean(row.push_token),
    }))
    .sort((a, b) => (b.last_seen_ms ?? 0) - (a.last_seen_ms ?? 0));
};

/**
 * Sign an installation out of this account.
 *
 * Returns false when there is no such device, so the route can answer 404
 * rather than pretend. The caller is responsible for the loud half — cutting
 * the socket and ringing the push doorbell; this is only the durable fact.
 */
export const revokeDevice = async (userId: string, deviceId: string): Promise<boolean> => {
  await hydrate(userId);
  const row = bucket(userId).get(deviceId);
  if (!row) return false;
  if (row.revoked_at !== null) return true;

  row.revoked_at = Date.now();
  row.checked_at = Date.now();
  row.connected = false;
  await persist(row);
  console.log(`==playback: device revoked user=${userId} device=${deviceId}`);
  return true;
};

/**
 * May this installation still speak for this account?
 *
 * Answered from the cache, with the negative answer re-read from Postgres every
 * `REVOKED_RECHECK_MS` — see the constant for why. A device nobody has heard of
 * is NOT revoked: that is a fresh install, or this replica's first sight of it.
 */
export const isDeviceRevoked = async (userId: string, deviceId: string): Promise<boolean> => {
  await hydrate(userId);
  const row = bucket(userId).get(deviceId);
  if (row?.revoked_at) return true;
  if (row && Date.now() - row.checked_at < REVOKED_RECHECK_MS) return false;

  const ds = await initDataSource();
  if (!ds) return false;
  try {
    const stored = await ds.getRepository(Device).findOne({where: {id: deviceId, userId}});
    const revokedAt = stored?.revokedAt ? stored.revokedAt.getTime() : null;
    if (row) {
      row.revoked_at = revokedAt;
      row.checked_at = Date.now();
    }
    return revokedAt !== null;
  } catch (error) {
    // A database that is down must not sign everybody out.
    console.error("==playback: could not check revocation:", (error as Error)?.message ?? error);
    return false;
  }
};

/** Tests only. */
export const __resetDeviceRegistry = (): void => {
  cache.clear();
  loaded.clear();
};

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
  /** a live socket on THIS process */
  connected: boolean;
}

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

/** Tests only. */
export const __resetDeviceRegistry = (): void => {
  cache.clear();
  loaded.clear();
};

// src/services/wake.ts
//
// The doorbell — NOT the channel.
//
// A playback command always travels over the target device's WebSocket. When
// that socket is gone (app backgrounded and silent, screen off long enough for
// the OS to suspend it) we ring a data-only push so the app wakes up,
// reconnects and pulls the state itself. What the push carries is deliberately
// nothing but a hint: pushes are unordered, droppable and, on iOS, throttled to
// a handful per hour, so no state may ever depend on one arriving.
//
// Hard limits worth remembering before anyone tries to make this the transport:
//   * iOS: an app the user force-quit is NOT woken by a silent push at all.
//   * iOS: audio cannot be started from a background push.
//   * Both: delivery is best effort and can lag by seconds.
// Hence the picker greys out devices that are not currently connected.
import {push as cfg} from "@/configurations/playback";
import {getPushToken} from "@/services/devices";

/** device_id -> last time we rang it, so APNs does not start dropping us */
const lastWake = new Map<string, number>();

export interface WakeReason {
  type: "transfer" | "state";
  user_id: string;
  version: number;
}

/**
 * Ring a device. Resolves to true only if Expo accepted the message — which
 * still says nothing about it being delivered.
 */
export const wakeDevice = async (
  userId: string,
  deviceId: string,
  reason: WakeReason,
): Promise<boolean> => {
  if (!cfg.enabled) return false;

  const now = Date.now();
  const previous = lastWake.get(deviceId) ?? 0;
  if (now - previous < cfg.minIntervalMs) {
    console.log(`==playback: skipping wake for ${deviceId} (rung ${now - previous}ms ago)`);
    return false;
  }

  const token = await getPushToken(userId, deviceId);
  if (!token) return false;
  lastWake.set(deviceId, now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(cfg.accessToken ? {authorization: `Bearer ${cfg.accessToken}`} : {}),
      },
      body: JSON.stringify([
        {
          to: token,
          // no title/body: a data-only message, invisible to the user
          data: {kind: "playback-wake", ...reason},
          // iOS: the background-notification flag. Android: FCM data message.
          _contentAvailable: true,
          priority: "high",
          // do not sit in Expo's queue: a stale wake is worse than none
          ttl: 30,
        },
      ]),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`==playback: wake push rejected (${response.status})`);
      return false;
    }
    console.log(`==playback: rang ${deviceId} (${reason.type})`);
    return true;
  } catch (error) {
    console.error("==playback: wake push failed:", (error as Error)?.message ?? error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

/** Tests only. */
export const __resetWake = (): void => lastWake.clear();

// src/ws/hub.ts
//
// The device-facing channel. One WebSocket per running app; every socket of the
// same VK account forms that account's playback session.
//
// Why a socket and not a push: a transfer has to land in tens of milliseconds
// and carry a position that is still true when it arrives. Silent pushes are
// throttled, unordered and cannot start audio — they are only used, from here,
// to wake a device whose socket has died (see services/wake.ts).
import {IncomingMessage, Server as HttpServer} from "http";
import {Socket} from "net";
import {WebSocket, WebSocketServer} from "ws";
import {playback as cfg} from "@/configurations/playback";
import {listDevices, setConnected, touchDevice} from "@/services/devices";
import {
  applyProgress,
  applyUpdate,
  getState,
  onDeviceBack,
  onDeviceGone,
  subscribe,
  transfer,
} from "@/services/playback";
import {verifyCredentials} from "@/services/session";
import {wakeDevice} from "@/services/wake";
import {ClientFrame, PlaybackState, ServerFrame} from "@/types/playback";

export const WS_PATH = "/api/player/ws";

interface Connection {
  ws: WebSocket;
  userId: string;
  deviceId: string | null;
  alive: boolean;
  /** last time this device's row was written through to Postgres */
  persistedAt: number;
}

/** user_id -> live connections on THIS replica */
const rooms = new Map<string, Set<Connection>>();

const send = (connection: Connection, frame: ServerFrame): void => {
  if (connection.ws.readyState !== WebSocket.OPEN) return;
  try {
    connection.ws.send(JSON.stringify(frame));
  } catch (error) {
    console.error("==playback: send failed:", (error as Error)?.message ?? error);
  }
};

const room = (userId: string): Set<Connection> => {
  let set = rooms.get(userId);
  if (!set) {
    set = new Set();
    rooms.set(userId, set);
  }
  return set;
};

/** Is this device holding a socket on this replica? */
const isHere = (userId: string, deviceId: string): boolean =>
  [...(rooms.get(userId) ?? [])].some((c) => c.deviceId === deviceId && c.ws.readyState === WebSocket.OPEN);

const broadcastState = (state: PlaybackState): void => {
  const frame: ServerFrame = {t: "state", state, server_now_ms: Date.now()};
  for (const connection of rooms.get(state.user_id) ?? []) send(connection, frame);
};

const broadcastDevices = async (userId: string): Promise<void> => {
  const connections = rooms.get(userId);
  if (!connections || connections.size === 0) return;
  const devices = await listDevices(userId, getState(userId).active_device_id);
  const frame: ServerFrame = {t: "devices", devices, server_now_ms: Date.now()};
  for (const connection of connections) send(connection, frame);
};

/**
 * Tell every connected app that some tracks gained metadata.
 *
 * The frisky catalogue is the same for everybody — it is one radio station, not
 * a per-user library — so this goes to all rooms rather than to an owner. It
 * carries ids, not data: the app refreshes the list it is on and gets the merged
 * version from the REST route, which is the only place the merge lives.
 */
export const broadcastCatalog = (trackIds: string[]): void => {
  if (trackIds.length === 0) return;
  const frame: ServerFrame = {t: "catalog", track_ids: trackIds, server_now_ms: Date.now()};
  for (const connections of rooms.values()) {
    for (const connection of connections) send(connection, frame);
  }
};

const credentialsFrom = (request: IncomingMessage) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const bearer = header("authorization");
  return {
    token: header("x-auth-token") ?? (bearer?.startsWith("Bearer ") ? bearer.slice(7) : bearer) ?? url.searchParams.get("token") ?? "",
    user_id: header("x-auth-user") ?? url.searchParams.get("user") ?? "",
    secret: header("x-auth-secret") ?? url.searchParams.get("secret") ?? undefined,
    device_id: header("x-auth-device") ?? url.searchParams.get("device") ?? undefined,
  };
};

const handleFrame = async (connection: Connection, frame: ClientFrame): Promise<void> => {
  switch (frame.t) {
    case "hello": {
      connection.deviceId = frame.device_id;
      await touchDevice(
        connection.userId,
        {
          device_id: frame.device_id,
          name: frame.name,
          platform: frame.platform,
          app_version: frame.app_version,
          push_token: frame.push_token,
        },
        true,
      );
      connection.persistedAt = Date.now();
      onDeviceBack(connection.userId, frame.device_id);
      // the truth first, the roster second — the app can render immediately
      send(connection, {t: "state", state: getState(connection.userId), server_now_ms: Date.now()});
      await broadcastDevices(connection.userId);
      return;
    }

    case "progress": {
      if (!connection.deviceId) return;
      applyProgress(connection.userId, connection.deviceId, {
        position_ms: frame.position_ms,
        playing: frame.playing,
        track_id: frame.track_id,
      });
      return;
    }

    case "update": {
      if (!connection.deviceId) return;
      const before = getState(connection.userId).active_device_id;
      const state = applyUpdate(connection.userId, connection.deviceId, frame.update);
      if (state.active_device_id !== before) await broadcastDevices(connection.userId);
      return;
    }

    case "transfer": {
      if (!connection.deviceId) return;
      const state = transfer(connection.userId, connection.deviceId, frame.to_device_id, frame.play);
      await broadcastDevices(connection.userId);
      // The command is already on its way over the target's socket if it has
      // one. If it does not, ring the doorbell and hope: the app will pull this
      // very state on reconnect, position included.
      if (!isHere(connection.userId, frame.to_device_id)) {
        void wakeDevice(connection.userId, frame.to_device_id, {
          type: "transfer",
          user_id: connection.userId,
          version: state.version,
        });
      }
      return;
    }

    case "ping": {
      send(connection, {t: "pong", client_now_ms: frame.client_now_ms, server_now_ms: Date.now()});
      // cheap presence write-through, so other replicas see this device as live
      if (connection.deviceId && Date.now() - connection.persistedAt > 60_000) {
        connection.persistedAt = Date.now();
        void touchDevice(connection.userId, {device_id: connection.deviceId}, true);
      }
      return;
    }

    default:
      send(connection, {t: "error", message: "unknown frame"});
  }
};

export const attachPlaybackSocket = (server: HttpServer): WebSocketServer => {
  const wss = new WebSocketServer({noServer: true});

  server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const {pathname} = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== WS_PATH) return; // not ours: leave it to anyone else listening

    void (async () => {
      const credentials = credentialsFrom(request);
      const userId = await verifyCredentials(credentials);
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, {userId, deviceId: credentials.device_id ?? null});
      });
    })();
  });

  wss.on("connection", (ws: WebSocket, _request: IncomingMessage, context: {userId: string; deviceId: string | null}) => {
    const connection: Connection = {
      ws,
      userId: context.userId,
      deviceId: context.deviceId,
      alive: true,
      persistedAt: 0,
    };
    room(connection.userId).add(connection);
    console.log(`==playback: socket open user=${connection.userId} device=${connection.deviceId ?? "?"}`);

    // A device identified by the handshake alone still gets the current state,
    // so a reconnect after a wake-up push needs no round trip.
    send(connection, {t: "state", state: getState(connection.userId), server_now_ms: Date.now()});

    ws.on("message", (raw) => {
      void (async () => {
        try {
          await handleFrame(connection, JSON.parse(raw.toString()) as ClientFrame);
        } catch (error) {
          console.error("==playback: bad frame:", (error as Error)?.message ?? error);
          send(connection, {t: "error", message: "bad frame"});
        }
      })();
    });

    ws.on("pong", () => {
      connection.alive = true;
    });

    ws.on("close", () => {
      room(connection.userId).delete(connection);
      if (connection.deviceId) {
        setConnected(connection.userId, connection.deviceId, false);
        // still connected elsewhere (a second tab, a reconnect that raced)?
        if (!isHere(connection.userId, connection.deviceId)) {
          onDeviceGone(connection.userId, connection.deviceId);
        }
      }
      void broadcastDevices(connection.userId);
      console.log(`==playback: socket closed user=${connection.userId} device=${connection.deviceId ?? "?"}`);
    });

    ws.on("error", (error) => console.error("==playback: socket error:", error?.message ?? error));
  });

  // Drop sockets the OS never told us about (a suspended phone looks connected
  // for a long time otherwise, and would hold the "active device" badge).
  const heartbeat = setInterval(() => {
    for (const connections of rooms.values()) {
      for (const connection of connections) {
        if (!connection.alive) {
          connection.ws.terminate();
          continue;
        }
        connection.alive = false;
        try {
          connection.ws.ping();
        } catch {
          connection.ws.terminate();
        }
      }
    }
  }, cfg.heartbeatMs);
  heartbeat.unref?.();

  // Any state change — local, or arrived from another replica through Kafka —
  // goes straight down every socket of that user.
  subscribe(broadcastState);

  return wss;
};

/** Does this user have a live socket for that device on this replica? */
export const isDeviceConnected = (userId: string, deviceId: string): boolean => isHere(userId, deviceId);

/**
 * Push a fresh device roster to every socket of a user.
 *
 * The REST routes need this: a device that registers or transfers over HTTP is
 * invisible to the sockets otherwise, and the app cannot name the device that
 * just took the sound.
 */
export const refreshDevices = (userId: string): void => {
  void broadcastDevices(userId);
};

import express, {NextFunction} from "express";
import {Request, Response} from "@/types";
import {checkAuthAndroid} from "@/helper/vk";
import {vkMethod} from "@/helper/vk";
import {cleanupDataAndSortPart, formatPlaylist} from "@/helper";
import {listDevices, touchDevice} from "@/services/devices";
import {
  applyUpdate,
  getState,
  projectPosition,
  transfer,
} from "@/services/playback";
import {whenReplayed} from "@/services/kafka";
import {wakeDevice} from "@/services/wake";
import {isDeviceConnected, refreshDevices} from "@/ws/hub";
import {PlaybackUpdate} from "@/types/playback";

export const player = express.Router();

enum EqualiserMode {
    HIGHT = 23,
    H17 = 17,
    H13 = 13,
    H11 = 11,
    H7 = 7,
    H5 = 5,
    H3 = 3,
    MID = 0,
    L3 = -3,
    L5 = -5,
    L7 = -7,
    L11 = -11,
    L13 = -13,
    L17 = -17,
    LOW = -23,
}
interface Equaliser {
    frequency?: {
        "32"?: EqualiserMode
        "64"?: EqualiserMode
        "125"?: EqualiserMode
        "250"?: EqualiserMode
        "500"?: EqualiserMode
        "1K"?: EqualiserMode
        "2K"?: EqualiserMode
        "4K"?: EqualiserMode
        "8K"?: EqualiserMode
        "16K"?: EqualiserMode
    }
    gain?: EqualiserMode
}
const getEqualiser = (user_id: string, owner_id: string, id: string): Equaliser => {
    return {
        frequency: {
            "32": 0,
            "64": 0,
            "125": 0,
            "250": 0,
            "500": 0,
            "1K": 0,
            "2K": 0,
            "4K": 0,
            "8K": 0,
            "16K": 0,
        },
        gain: 0
    }
}

/**
 * get equalaiser information from the song
 * 
 * @param user_id - user id from profile information
 * @param owner_id - owner id of the song
 * @param id - song id
 * @returns Equalaiser
 * @example {
 * status: "ok",
 * frequency: {
 * "32": 0,
 * "64": 0,
 * "125": 0,
 * "250": 0,
 * "500": 0,
 * "1K": 0,
 * "2K": 0,
 * "4K": 0,
 * "8K": 0,
 * "16K": 0,
 * }
 * gain: 0
 * }
 **/
player.get("/equaliser/:user_id/:owner_id/:id", async (req: Request, res: Response) => {
    const response = getEqualiser(req.params.user_id, req.params.owner_id, req.params.id)
    res.status(200).send(response)
});

/**
 * add equalaiser information to the song
 * 
 * @param user_id - user id from profile information
 * @param owner_id - owner id of the song
 * @param id - song id
 * @returns
 * @example {
 * status: "ok",
 * frequency: {
 * "32": 0,
 * "64": 0,
 * "125": 0,
 * "250": 0,
 * "500": 0,
 * "1K": 0,
 * "2K": 0,
 * "4K": 0,
 * "8K": 0,
 * "16K": 0,
 * }
 * gain: 0
 * }
 */
player.patch("/equaliser/:user_id/:owner_id/:id", async (req: Request, res: Response) => {
    const eq: Equaliser = req.body
    const response = { status: "ok", eq }
    res.status(200).send(response)
});


// ===========================================================================
// CROSS-DEVICE PLAYBACK
//
// The socket at /api/player/ws is the live channel; these routes are the cold
// path — app start, and anything that has to work while the socket is down.
// Both read and write the SAME state, so an app that only ever polls still
// takes part in a transfer, just less promptly.
// ===========================================================================

/** The device this call comes from: the id the app persists and signs VK requests with. */
const deviceOf = (req: Request): string | null =>
  (req.headers["x-auth-device"] as string | undefined) ?? req.session?.device_id ?? null;

const userOf = (req: Request): string => String(req.session.user_id);

/**
 * Any call from a device is a sign of life: it keeps the device in the picker
 * and its `last_seen` fresh for the other replicas.
 */
const rememberDevice = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const device_id = deviceOf(req);
  if (device_id) {
    try {
      await touchDevice(userOf(req), {device_id});
    } catch (error) {
      console.error("==playback: could not remember device:", (error as Error)?.message ?? error);
    }
  }
  next();
};

const withNow = (req: Request) => {
  const state = getState(userOf(req));
  return {
    state,
    /** where the track is at this very moment, so a client need not do the maths */
    position_now_ms: projectPosition(state),
    server_now_ms: Date.now(),
  };
};

/**
 * The whole playback session: what is playing, where, and on which devices it
 * could play instead.
 *
 * This is what a cold-started app calls: it restores the last track and its
 * position no matter which device was playing it.
 */
player.get("/state", checkAuthAndroid, rememberDevice, async (req: Request, res: Response) => {
  try {
    await whenReplayed();
    const user_id = userOf(req);
    const payload = withNow(req);
    res.status(200).send({
      ...payload,
      devices: await listDevices(user_id, payload.state.active_device_id),
    });
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/** Report what this device is playing (socket-less fallback for `update`). */
player.put("/state", checkAuthAndroid, rememberDevice, async (req: Request, res: Response) => {
  const device_id = deviceOf(req);
  if (!device_id) {
    res.status(400).send({errMessage: "No device id"});
    return;
  }
  try {
    await whenReplayed();
    const update: PlaybackUpdate = req.body ?? {};
    const state = applyUpdate(userOf(req), device_id, update);
    res.status(200).send({state, position_now_ms: projectPosition(state), server_now_ms: Date.now()});
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/** The picker's list: every known device, with the reachable ones marked. */
player.get("/devices", checkAuthAndroid, rememberDevice, async (req: Request, res: Response) => {
  try {
    const user_id = userOf(req);
    res.status(200).send({
      devices: await listDevices(user_id, getState(user_id).active_device_id),
      server_now_ms: Date.now(),
    });
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Register this device, and its push token.
 *
 * The token is a doorbell, not a channel: it is only used to wake a device that
 * has no socket, so it can reconnect and pull the state itself.
 */
player.post("/devices", checkAuthAndroid, async (req: Request, res: Response) => {
  const device_id = deviceOf(req) ?? req.body?.device_id;
  if (!device_id) {
    res.status(400).send({errMessage: "No device id"});
    return;
  }
  try {
    const user_id = userOf(req);
    await touchDevice(user_id, {
      device_id,
      name: req.body?.name,
      platform: req.body?.platform,
      app_version: req.body?.app_version,
      push_token: req.body?.push_token,
    });
    // a device the sockets have not seen yet: tell them, or the picker on the
    // other devices will not list it
    refreshDevices(user_id);
    res.status(200).send({
      devices: await listDevices(user_id, getState(user_id).active_device_id),
      server_now_ms: Date.now(),
    });
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Hand the sound to another device.
 *
 * The position is projected to now before it is written, so the target seeks to
 * where the track really is. If the target has no socket here, ring its silent
 * push: it will reconnect and read this state, which already contains
 * everything it needs.
 */
player.post("/transfer", checkAuthAndroid, rememberDevice, async (req: Request, res: Response) => {
  const to_device_id: string | undefined = req.body?.to_device_id;
  if (!to_device_id) {
    res.status(400).send({errMessage: "No to_device_id"});
    return;
  }
  try {
    await whenReplayed();
    const user_id = userOf(req);
    const state = transfer(user_id, deviceOf(req), to_device_id, req.body?.play);
    // the roster changed shape (a new active device): the sockets need it too
    refreshDevices(user_id);
    if (!isDeviceConnected(user_id, to_device_id)) {
      void wakeDevice(user_id, to_device_id, {type: "transfer", user_id, version: state.version});
    }
    res.status(200).send({state, position_now_ms: projectPosition(state), server_now_ms: Date.now()});
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Re-resolve one track by its VK ids.
 *
 * A transfer carries ids, never a URL: VK signs the stream for the requesting
 * session, so the receiving device has to ask for its own. Same shape as a
 * playlist item, so the app can hand it straight to the player.
 */
player.get("/track/:owner_id/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  const {owner_id, id} = req.params;
  if (!owner_id || !id) {
    res.status(400).send({errMessage: "No owner_id or audio id"});
    return;
  }
  try {
    const response: any = await vkMethod(req, "audio.getById", {audios: `${owner_id}_${id}`});
    const items = response?.response ?? [];
    if (items.length === 0) {
      res.status(404).send({errMessage: "Track not found"});
      return;
    }
    const list = formatPlaylist(cleanupDataAndSortPart({count: items.length, items}), 0);
    res.status(200).send(list.items[0]);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

enum StatusMode {
    PAUSE = 0,
    PLAY = 1,
}

interface PlayerStatus {
    device_id: string
    status: StatusMode
}

/**
 * Legacy status ping: `{device_id, status}` for one track.
 *
 * Kept because older builds call it. It is now a thin wrapper over the same
 * state the socket writes, so an old client at least keeps the session's
 * play/pause honest.
 */
player.patch("/:user_id/:owner_id/:id", checkAuthAndroid, rememberDevice, async (req: Request, res: Response) => {
    const body: PlayerStatus = req.body ?? {} as PlayerStatus;
    const device_id = body.device_id || deviceOf(req);
    if (!device_id) {
        res.status(400).send({errMessage: "No device id"});
        return;
    }
    try {
        const owner_id = Number(req.params.owner_id);
        const id = Number(req.params.id);
        const state = applyUpdate(userOf(req), device_id, {
            track: {track_id: `${owner_id}_${id}`, owner_id, id},
            playing: body.status === StatusMode.PLAY,
        });
        res.status(200).send({state, server_now_ms: Date.now()});
    } catch (error: Error | any) {
        res.status(500).send({errMessage: error.message});
    }
});

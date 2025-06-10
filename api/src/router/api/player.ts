import express, { NextFunction } from "express";
import { Playlist, Request, Response } from "@/types";

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



enum StatusMode {
    PAUSE = 0,
    PLAY = 1,
}

interface PlayerStatus {
    device_id: string
    status: StatusMode
}
/**
 * put current player information
 * 
 * @param user_id - user id from profile information
 * @param owner_id - owner id of the song
 * @param id - song id
 * @returns
 * @example {
 * device_id: "123456",
 * status: 1
 * }
 */
player.patch("/:user_id/:owner_id/:id", async (req: Request, res: Response) => {
    const body: PlayerStatus = req.body
});
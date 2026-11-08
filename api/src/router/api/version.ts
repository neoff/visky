import express from "express";
import {Request, Response} from "@/types";
import {appVersion} from "@/constants/appVersion";
import {storeKindFor, storeVersion} from "@/services/storeVersion";

export const version = express.Router();

/**
 * "Is there a newer one in the store?"
 *
 * `version` is the App Store's number for the asking client's platform — NOT
 * this api's. The installed clients read `version` and put up an update notice
 * when it is newer than theirs; answering with the api's own build number made
 * a server deploy announce a release no store had (services/storeVersion). It
 * is absent when there is nothing true to say: an Android client, an
 * unrecognised one, or Apple not answering — and an absent version means no
 * notice.
 *
 * `api` is this server's own build, for whoever is looking at it by hand. No
 * client reads it.
 *
 * DELIBERATELY UNAUTHENTICATED. A device that was signed out, or whose token
 * aged out, is exactly the one most likely to be old — and the answer is not a
 * secret.
 *
 * `private` and `Vary: User-Agent`: the answer depends on who is asking, so a
 * shared cache must not hand the Mac's number to a phone.
 */
version.get("/", async (req: Request, res: Response) => {
    const kind = storeKindFor(req.get("user-agent"));
    const store = await storeVersion(kind);
    res.set("Cache-Control", "private, max-age=60");
    res.set("Vary", "User-Agent");
    res.status(200).send({
        ...(store ? {version: store} : {}),
        api: appVersion,
    });
});

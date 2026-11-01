import express from "express";
import {Request, Response} from "@/types";
import {appVersion} from "@/constants/appVersion";

export const version = express.Router();

/**
 * "Is there a newer one?"
 *
 * The api's own number, which `scripts/sync-version.sh` has already written
 * into every frontend, so a client comparing it with its own is comparing
 * against the release it belongs to.
 *
 * DELIBERATELY UNAUTHENTICATED. A device that was signed out, or whose token
 * aged out, is exactly the one most likely to be old — telling it to update is
 * not a secret, and requiring a session would hide the notice from the screens
 * that need it most. Nothing here reads the request.
 *
 * Cached for a minute at the edge rather than not at all: every client asks on
 * launch, and the answer changes once per release.
 */
version.get("/", (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=60");
    res.status(200).send({version: appVersion});
});

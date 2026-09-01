// src/router/api/pair.ts
//
// Two sides of one handover, and they are not symmetric:
//
//   the screen that WANTS a session  — anonymous, it has no credentials yet;
//   the phone that HAS one          — authenticated, and checked against VK
//                                     before anything is parked for delivery.
//
// See services/pairing.ts for why the session travels through the server at all
// and what is deliberately not kept.
import express from "express";
import {checkAuthAndroid} from "@/helper/vk";
import {
  claimPairing,
  collectPairing,
  openPairing,
  peekPairing,
  PAIR_TTL_MS,
} from "@/services/pairing";
import {verifyCredentials} from "@/services/session";
import {Request, Response} from "@/types";

export const pair = express.Router();

/**
 * A brake on the two anonymous routes, not a security boundary.
 *
 * `POST /` mints state and `GET /:id/peek` is the only place a short code can be
 * probed, so both are worth bounding. The real defence against a guessed code is
 * its entropy plus the fact that the phone's owner reads a name and taps send.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, {count: number; since: number}>();

const tooMany = (req: Request): boolean => {
  const now = Date.now();
  const who = req.ip ?? "unknown";
  const seen = hits.get(who);
  if (!seen || now - seen.since >= WINDOW_MS) {
    hits.set(who, {count: 1, since: now});
    // Cheap enough to do here, and keeps the map from tracking every address
    // that ever paired.
    if (hits.size > 5000) for (const [key, value] of hits) if (now - value.since >= WINDOW_MS) hits.delete(key);
    return false;
  }
  seen.count += 1;
  return seen.count > MAX_PER_WINDOW;
};

/**
 * POST /api/pair — "I am a screen with no session; here is where to send one."
 *
 * body: { name?, platform? }   — what to call this screen on the phone
 * 200:  { pair_id, code, expires_in }
 */
pair.post("/", (req: Request, res: Response) => {
  if (tooMany(req)) {
    res.status(429).send({errMessage: "Too many pairing attempts, wait a minute"}).end();
    return;
  }
  const {name, platform} = req.body || {};
  const opened = openPairing(String(name ?? ""), String(platform ?? ""));
  console.log("==pair: opened", opened.pair_id.slice(0, 8), "for", opened.name);
  res.status(200).send(opened).end();
});

/**
 * GET /api/pair/:idOrCode/peek — what the phone shows before it hands anything
 * over. Carries no credentials in either direction; it exists so a typed code
 * can be turned into "Sign in visky on Mac (Chrome)?" instead of a bare yes/no.
 */
pair.get("/:idOrCode/peek", (req: Request, res: Response) => {
  if (tooMany(req)) {
    res.status(429).send({errMessage: "Too many pairing attempts, wait a minute"}).end();
    return;
  }
  const found = peekPairing(String(req.params.idOrCode));
  if (!found) {
    res.status(410).send({error: "expired"}).end();
    return;
  }
  res.status(200).send({name: found.name, platform: found.platform, expires_in: found.expires_in}).end();
});

/**
 * POST /api/pair/:idOrCode/claim — the phone hands its session to that screen.
 *
 * The credentials come from the `x-auth-*` headers this app already sends on
 * every call, not from the body, and they are checked against VK before being
 * parked: a slot filled with a forged token would sign a browser into nothing
 * and look like our bug.
 */
pair.post("/:idOrCode/claim", checkAuthAndroid, async (req: Request, res: Response) => {
  const {access_token, secret, user_id, device_id} = req.session ?? {};

  if (!access_token || !secret || !user_id) {
    // Specifically the secret: the API signs every VK audio call with it, so a
    // session handed over without one logs in and then fails on the first track.
    res.status(400).send({errMessage: "This session cannot be handed over: no token, secret or user"}).end();
    return;
  }

  const verified = await verifyCredentials({token: access_token, user_id: String(user_id), secret, device_id});
  if (!verified) {
    res.status(403).send({errMessage: "VK rejected this session"}).end();
    return;
  }

  const expiresIn = Number(req.body?.expires_in);
  const result = claimPairing(String(req.params.idOrCode), {
    access_token,
    secret,
    user_id: String(user_id),
    expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? Math.round(expiresIn) : undefined,
  });

  if (result === "unknown") {
    res.status(410).send({error: "expired"}).end();
    return;
  }
  if (result === "taken") {
    res.status(409).send({error: "taken"}).end();
    return;
  }

  console.log("==pair: claimed", String(req.params.idOrCode).slice(0, 8), "by user", verified);
  res.status(200).send({ok: true}).end();
});

/**
 * GET /api/pair/:id — the waiting screen asking "yet?".
 *
 * 204 while nothing has arrived, 200 with the session once it has — once, after
 * which the slot is gone. Polled, not held open: a hanging GET through traefik
 * and an nginx in front of it is more moving parts than a 1.5s poll over three
 * minutes is worth.
 */
pair.get("/:id", (req: Request, res: Response) => {
  const result = collectPairing(String(req.params.id));

  if (result.kind === "gone") {
    res.status(410).send({error: "expired"}).end();
    return;
  }
  if (result.kind === "pending") {
    res.status(204).end();
    return;
  }

  console.log("==pair: delivered a session to", String(req.params.id).slice(0, 8));
  // No cache, anywhere, ever: this body is the account.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(result.session).end();
});

export {PAIR_TTL_MS};

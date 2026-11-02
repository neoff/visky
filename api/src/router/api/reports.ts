// src/router/api/reports.ts
//
// The two forms on the website, and the dashboard that shows what they
// produced. No authentication: these are open to the internet by design, which
// is also why everything below is about limits.
import express from "express";
import {Request, Response} from "@/types";
import {recent, submit, ReportKind} from "@/services/reports";

export const reports = express.Router();

const MAX_TITLE = 120;
const MAX_BODY = 4000;
const MAX_EMAIL = 254;
const MAX_VK = 200;

/**
 * One submission every thirty seconds per address, twenty an hour.
 *
 * In memory on purpose: the api runs as a single replica, and a shared counter
 * in Postgres would be a write on the hot path of the thing we are rate
 * limiting. If this ever scales out, the worst case is the limit being per-pod,
 * which is still a limit.
 */
const MIN_GAP_MS = 30_000;
const HOURLY_CAP = 20;
const seen = new Map<string, {last: number; hour: number; count: number}>();

const tooFast = (key: string): string | null => {
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const entry = seen.get(key);

  if (!entry || entry.hour !== hour) {
    seen.set(key, {last: now, hour, count: 1});
    return null;
  }
  if (now - entry.last < MIN_GAP_MS) return "one report at a time, please — try again in a moment";
  if (entry.count >= HOURLY_CAP) return "too many reports from here in the last hour";

  entry.last = now;
  entry.count += 1;
  return null;
};

// Behind an ingress every request carries the proxy's address, so the client's
// own is only in the forwarded header.
const clientKey = (req: Request): string => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
};

const trimmed = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const handle = (kind: ReportKind) => async (req: Request, res: Response) => {
  const title = trimmed(req.body?.title, MAX_TITLE);
  const body = trimmed(req.body?.body, MAX_BODY);
  const email = trimmed(req.body?.email, MAX_EMAIL);

  if (!title || !body) {
    res.status(400).send({error: "a subject and some details are both needed"});
    return;
  }
  // Deliberately loose: the address is optional and only used to reply. A
  // stricter pattern rejects real addresses more often than it catches typos.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).send({error: "that email address does not look right"});
    return;
  }

  const limited = tooFast(clientKey(req));
  if (limited) {
    res.status(429).send({error: limited});
    return;
  }

  try {
    const result = await submit({kind, title, body, email: email || null});
    console.info(`report ${result.ref} (${kind}) — ${result.delivery.join("; ")}`);
    res.status(201).send({ref: result.ref});
  } catch (error) {
    // Storage failed, so the report does NOT exist. Say so plainly: the form
    // tells the person nothing was sent, and that is true.
    console.error("report could not be stored:", error);
    res.status(503).send({error: "we could not record that just now"});
  }
};

reports.post("/feedback", handle("feedback"));
reports.post("/bugreport", handle("bug"));

/**
 * Signing up for the closed beta.
 *
 * Its own handler rather than a third mode of the one above, because the shape
 * of the submission is different in the way that matters: here the ADDRESS is
 * the submission. A tester is added to the Play test by email, so an empty one
 * is not a report missing an optional field — it is nothing at all.
 *
 * The two pledges are checked on the server as well as in the form. They are
 * the terms the page states — a VK account, because the archive the app reads
 * lives there, and at least one report back — and a signup that arrives with
 * either one unticked arrived from something other than the form.
 */
reports.post("/betatest", async (req: Request, res: Response) => {
  const email = trimmed(req.body?.email, MAX_EMAIL);
  const vk = trimmed(req.body?.vk, MAX_VK);
  const note = trimmed(req.body?.note, MAX_BODY);
  const agreed = (value: unknown): boolean => value === true || value === "on" || value === "true";

  if (!email) {
    res.status(400).send({error: "an email address is needed — it is what Play adds you by"});
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).send({error: "that email address does not look right"});
    return;
  }
  if (!vk) {
    res.status(400).send({error: "a VK profile is needed — the archive the app reads lives there"});
    return;
  }
  if (!agreed(req.body?.agreeVk) || !agreed(req.body?.agreeReport)) {
    res.status(400).send({error: "both terms have to be accepted"});
    return;
  }

  const limited = tooFast(clientKey(req));
  if (limited) {
    res.status(429).send({error: limited});
    return;
  }

  // The title is what the public list would show, so it holds no address and
  // no profile. Everything identifying is in the body and the email column,
  // and `recent()` returns neither.
  const body = [
    `VK: ${vk}`,
    "",
    "Accepted: has a VK account; will send at least one report back (a feature",
    "that works or does not, with the number of the report they filed).",
    ...(note ? ["", "They added:", note] : []),
  ].join("\n");

  try {
    const result = await submit({
      kind: "tester",
      title: "Closed beta: a tester signed up",
      body,
      email,
    });
    console.info(`beta signup ${result.ref} — ${result.delivery.join("; ")}`);
    res.status(201).send({ref: result.ref});
  } catch (error) {
    console.error("beta signup could not be stored:", error);
    res.status(503).send({error: "we could not record that just now"});
  }
});

/** The public dashboard's data. Addresses and bodies never leave the database. */
reports.get("/reports", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
    res.status(200).send({items: await recent(limit)});
  } catch (error) {
    res.status(500).send({error: (error as Error).message});
  }
});

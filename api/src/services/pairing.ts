// src/services/pairing.ts
//
// The rendezvous behind "pair this computer".
//
// WHY THIS EXISTS AT ALL. A QR code is a one-way channel: it carries data from
// the screen showing it to the camera reading it. The original handover used
// that directly — the phone, which HAS the session, drew the credentials into a
// code and the laptop's camera read them. Nothing ever touched this server.
//
// Pointing the laptop at the phone is the wrong way round in practice: desktops
// often have no camera, the good camera is always the one in your hand, and the
// screen you want to sign in is the one you are sitting at. So the screen that
// WANTS a session shows the code and the phone reads it.
//
// That inverts the direction of the data and the QR can no longer carry the
// credentials — the machine drawing it does not have any. It carries a pointer,
// and the session travels the other way, through here.
//
// WHAT THIS DOES AND DOES NOT KEEP. A pending pairing lives in this process's
// memory for three minutes, is handed out exactly once, and is deleted on the
// way out. It is never written to Postgres, never logged, and never published to
// Kafka. The credentials are the same ones every REST call already carries in
// its `x-auth-*` headers, so relaying them adds no new class of exposure — but
// parking them anywhere durable would.
//
// SINGLE REPLICA. `replicaCount: 1` in the chart, so one Map is the whole story.
// During a rolling update two pods exist for a few seconds and a pairing started
// on the old one cannot be claimed on the new one; it expires and the user taps
// again. If this ever scales out, this is the file that has to move onto the
// playback events topic.
import {randomBytes} from "crypto";

export interface HandedSession {
  access_token: string;
  secret: string;
  user_id: string;
  /** Seconds left on the VK token, when the sender knows. */
  expires_in?: number;
}

export interface Pending {
  id: string;
  code: string;
  /** What the waiting screen calls itself. Self-declared — shown, never trusted. */
  name: string;
  platform: string;
  createdAt: number;
  session: HandedSession | null;
}

export interface PairView {
  pair_id: string;
  code: string;
  name: string;
  platform: string;
  expires_in: number;
}

/** Long enough that a code cannot be guessed inside its lifetime. */
export const PAIR_TTL_MS = 3 * 60 * 1000;

/**
 * A ceiling, not a quota. Nobody legitimately has hundreds of screens waiting to
 * be paired; this only stops an open endpoint from growing the heap forever.
 */
const MAX_PENDING = 200;

/** Crockford base32 without the letters that get misread off a screen. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const pending = new Map<string, Pending>();
/** code -> id, so a typed code is one lookup and not a scan of the map. */
const byCode = new Map<string, string>();

const expired = (entry: Pending, now: number): boolean => now - entry.createdAt >= PAIR_TTL_MS;

const forget = (entry: Pending): void => {
  pending.delete(entry.id);
  byCode.delete(entry.code);
};

/**
 * Lazy sweep. A setInterval here would hold the event loop open in tests and buy
 * nothing: the map only grows when someone calls in, so cleaning up then is
 * enough and costs one pass over at most MAX_PENDING entries.
 */
const sweep = (now: number): void => {
  for (const entry of pending.values()) if (expired(entry, now)) forget(entry);
};

const token = (bytes: number): string => randomBytes(bytes).toString("hex");

const shortCode = (): string => {
  // 8 symbols of the alphabet above ≈ 40 bits. Guessing one inside three
  // minutes is not a threat worth a longer code the user has to read aloud —
  // and a guess still only gets a session if the phone's owner confirms the
  // name on the screen in front of them.
  const raw = randomBytes(8);
  let out = "";
  for (const byte of raw) out += ALPHABET[byte % ALPHABET.length];
  return out;
};

const view = (entry: Pending, now: number): PairView => ({
  pair_id: entry.id,
  code: entry.code,
  name: entry.name,
  platform: entry.platform,
  expires_in: Math.max(0, Math.round((PAIR_TTL_MS - (now - entry.createdAt)) / 1000)),
});

/** Called by the screen that wants a session. */
export const openPairing = (name: string, platform: string): PairView => {
  const now = Date.now();
  sweep(now);

  if (pending.size >= MAX_PENDING) {
    // Drop the oldest rather than refusing: the map is bounded either way, and
    // refusing would let one noisy client lock everyone else out.
    const oldest = [...pending.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) forget(oldest);
  }

  const entry: Pending = {
    id: token(16),
    code: shortCode(),
    name: name.slice(0, 60) || "A browser",
    platform: platform.slice(0, 24) || "web",
    createdAt: now,
    session: null,
  };
  pending.set(entry.id, entry);
  byCode.set(entry.code, entry.id);
  return view(entry, now);
};

/** Resolve either form the phone can arrive with: the QR's id, or a typed code. */
const find = (idOrCode: string): Pending | null => {
  const now = Date.now();
  const key = idOrCode.trim();
  const id = pending.has(key) ? key : byCode.get(key.toUpperCase().replace(/[\s-]/g, ""));
  const entry = id ? pending.get(id) : undefined;
  if (!entry) return null;
  if (expired(entry, now)) {
    forget(entry);
    return null;
  }
  return entry;
};

/** What the phone shows the user before it hands anything over. */
export const peekPairing = (idOrCode: string): PairView | null => {
  const entry = find(idOrCode);
  return entry ? view(entry, Date.now()) : null;
};

export type ClaimResult = "ok" | "unknown" | "taken";

/** The phone, holding a verified session, fills a waiting slot. */
export const claimPairing = (idOrCode: string, session: HandedSession): ClaimResult => {
  const entry = find(idOrCode);
  if (!entry) return "unknown";
  // Refusing a second claim keeps one slot pointing at one account. The waiting
  // screen has already been told about the first, and silently swapping the
  // account underneath it would be the worst possible outcome of a mistyped code.
  if (entry.session) return "taken";
  entry.session = session;
  return "ok";
};

export type Collected =
  | {kind: "pending"}
  | {kind: "gone"}
  | {kind: "session"; session: HandedSession};

/**
 * The waiting screen asking "yet?". Handing the session over deletes the slot:
 * it is a one-shot delivery, so a leaked poll URL replayed later gets nothing.
 */
export const collectPairing = (id: string): Collected => {
  const entry = find(id);
  if (!entry) return {kind: "gone"};
  if (!entry.session) return {kind: "pending"};
  const session = entry.session;
  forget(entry);
  return {kind: "session", session};
};

/** Tests only. */
export const __resetPairing = (): void => {
  pending.clear();
  byCode.clear();
};

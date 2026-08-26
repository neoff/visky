// src/configurations/frisky.ts
//
// The official Frisky radio API (api.frisky.fm/v3) — where the metadata VK does
// not carry comes from: the tracklist of a mix, its genres, the artist's photo
// and biography.
//
// Everything here is optional in the same way Kafka and Postgres are: with
// `FRISKY_API_ENABLED=false`, or with no database configured, the playlist is
// served exactly as before — VK data only, no enrichment. The API must never
// depend on frisky.fm being up.
import * as dotenv from "dotenv";

dotenv.config();

const bool = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const frisky = {
  baseUrl: process.env.FRISKY_API_URL ?? "https://api.frisky.fm/v3",
  enabled: bool(process.env.FRISKY_API_ENABLED, true),
  timeoutMs: int(process.env.FRISKY_API_TIMEOUT_MS, 15_000),
  /**
   * frisky.fm is a small public API and this is a background job — one request
   * at a time with a pause between them, so a full artist backfill is polite
   * rather than fast.
   */
  requestGapMs: int(process.env.FRISKY_API_GAP_MS, 250),
  /** page size for /artists and /mixes */
  pageSize: int(process.env.FRISKY_API_PAGE_SIZE, 100),
  /** the artist directory is a name -> id map; it changes slowly */
  artistIndexTtlMs: int(process.env.FRISKY_ARTIST_INDEX_TTL_MS, 7 * 24 * 60 * 60 * 1000),
  /** an artist's mixes are re-pulled when a new VK track of theirs shows up */
  artistMixesTtlMs: int(process.env.FRISKY_ARTIST_MIXES_TTL_MS, 24 * 60 * 60 * 1000),
  /** how long a track stays "unmatched" before the worker tries it again */
  retryAfterMs: int(process.env.FRISKY_RETRY_AFTER_MS, 6 * 60 * 60 * 1000),
  /** how many pending tracks one worker pass resolves */
  batchSize: int(process.env.FRISKY_BATCH_SIZE, 25),
  /** the worker wakes up on this interval as well as on every playlist refresh */
  workerIntervalMs: int(process.env.FRISKY_WORKER_INTERVAL_MS, 60_000),
  /** delay before the first pass, so a booting replica serves requests first */
  workerStartDelayMs: int(process.env.FRISKY_WORKER_START_DELAY_MS, 15_000),
};

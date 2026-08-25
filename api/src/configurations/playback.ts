// src/configurations/playback.ts
//
// Everything the cross-device playback ("Connect") feature needs to know about
// its infrastructure. All of it is optional: with nothing configured the API
// still serves playback state, it just keeps it in this process only — useful
// for tests and for a bare `yarn dev`.
import * as dotenv from "dotenv";

dotenv.config();

const bool = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Kafka is the store of record for playback state.
 *
 * `STATE_TOPIC` is log-compacted and keyed by user id, so the newest snapshot
 * per user survives forever and a booting replica rebuilds the whole world by
 * reading it from the beginning. `EVENTS_TOPIC` is the append-only history
 * (what played where) and is allowed to age out.
 *
 * Local: EXTERNAL listener on localhost:29092 (docker `kafka`).
 * Cluster: kafka-kafka.default.svc.cluster.local:29092 (ns `default`).
 */
export const kafka = {
  brokers: (process.env.KAFKA_BROKERS ?? "").split(",").map((b) => b.trim()).filter(Boolean),
  clientId: process.env.KAFKA_CLIENT_ID ?? "visky-api",
  stateTopic: process.env.KAFKA_STATE_TOPIC ?? "visky.playback.state.v1",
  eventsTopic: process.env.KAFKA_EVENTS_TOPIC ?? "visky.playback.events.v1",
  partitions: int(process.env.KAFKA_PARTITIONS, 3),
  replicationFactor: int(process.env.KAFKA_REPLICATION_FACTOR, 1),
  /** events are history, not state — a week is plenty */
  eventsRetentionMs: int(process.env.KAFKA_EVENTS_RETENTION_MS, 7 * 24 * 60 * 60 * 1000),
  /** how long the boot-time replay may take before we start serving anyway */
  replayTimeoutMs: int(process.env.KAFKA_REPLAY_TIMEOUT_MS, 10_000),
  get enabled(): boolean {
    return this.brokers.length > 0;
  },
};

/** Postgres keeps the durable identities: which user owns which device. */
export const db = {
  host: process.env.DB_HOST ?? "",
  port: int(process.env.DB_PORT, 5432),
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: process.env.DB_NAME ?? "visky",
  synchronize: bool(process.env.DB_SYNCHRONIZE, false),
  logging: bool(process.env.DB_LOGGING, false),
  get enabled(): boolean {
    return this.host.length > 0;
  },
};

/**
 * Silent push is the doorbell, never the channel.
 *
 * A device only receives playback commands over its WebSocket. When the target
 * of a transfer has no live socket we send it a data-only push so it wakes up,
 * reconnects and pulls the state itself. Apple throttles background pushes
 * hard (a handful per hour), hence `minIntervalMs`.
 */
export const push = {
  /** Expo's push service; tokens are ExponentPushToken[...] minted in the app */
  url: process.env.EXPO_PUSH_URL ?? "https://exp.host/--/api/v2/push/send",
  /** optional: only needed if the Expo project enforces push security */
  accessToken: process.env.EXPO_ACCESS_TOKEN ?? "",
  enabled: bool(process.env.PUSH_ENABLED, true),
  minIntervalMs: int(process.env.PUSH_MIN_INTERVAL_MS, 20_000),
  timeoutMs: int(process.env.PUSH_TIMEOUT_MS, 5_000),
};

export const playback = {
  /** a device that has not been heard from for this long is treated as offline */
  deviceTimeoutMs: int(process.env.PLAYBACK_DEVICE_TIMEOUT_MS, 45_000),
  /** the socket ping interval; also the presence heartbeat */
  heartbeatMs: int(process.env.PLAYBACK_HEARTBEAT_MS, 15_000),
  /** how often the active device reports its position */
  progressIntervalMs: int(process.env.PLAYBACK_PROGRESS_INTERVAL_MS, 5_000),
};

// src/services/kafka.ts
//
// Kafka is the store of record for playback state — and the only thing that
// makes more than one API replica possible. Devices never touch it: they speak
// WebSocket to whichever replica they landed on, and that replica publishes to
// Kafka, from where every other replica picks the change up and pushes it down
// its own sockets.
//
//   visky.playback.state.v1   key = user_id, cleanup.policy = compact
//                             -> the newest snapshot per user lives forever, so
//                                a booting replica rebuilds the world by reading
//                                the topic from the beginning
//   visky.playback.events.v1  key = user_id, retention 7d
//                             -> append-only history (what played where)
//
// Nothing here is required: with KAFKA_BROKERS unset the API keeps state in
// memory and logs a warning. Playback still works, it just does not survive a
// restart and does not fan out beyond this process.
import {Consumer, Kafka, Producer, logLevel} from "kafkajs";
import {randomUUID} from "crypto";
import {kafka as cfg} from "@/configurations/playback";
import {PlaybackEvent, PlaybackState} from "@/types/playback";

let client: Kafka | null = null;
let producer: Producer | null = null;
let consumer: Consumer | null = null;
let connected = false;

type StateHandler = (state: PlaybackState) => void;
let onState: StateHandler = () => undefined;

/** Resolves once the compacted topic has been replayed (or we gave up waiting). */
let replayResolve: (() => void) | null = null;
let replayed: Promise<void> = Promise.resolve();

export const isKafkaEnabled = (): boolean => cfg.enabled;
export const isKafkaConnected = (): boolean => connected;
/** Await before serving state, so a cold replica does not answer "nothing is playing". */
export const whenReplayed = (): Promise<void> => replayed;

const ensureTopics = async (): Promise<void> => {
  const admin = client!.admin();
  await admin.connect();
  try {
    // Only ask for what is missing: asking for an existing topic makes the
    // broker answer TOPIC_ALREADY_EXISTS, which kafkajs logs as an error.
    const existing = new Set(await admin.listTopics());
    const wanted = [
        {
          topic: cfg.stateTopic,
          numPartitions: cfg.partitions,
          replicationFactor: cfg.replicationFactor,
          configEntries: [
            // the whole point: keep the last value per user id forever
            {name: "cleanup.policy", value: "compact"},
            {name: "min.cleanable.dirty.ratio", value: "0.1"},
            {name: "segment.ms", value: "60000"},
          ],
        },
        {
          topic: cfg.eventsTopic,
          numPartitions: cfg.partitions,
          replicationFactor: cfg.replicationFactor,
          configEntries: [
            {name: "cleanup.policy", value: "delete"},
            {name: "retention.ms", value: String(cfg.eventsRetentionMs)},
          ],
        },
    ].filter((topic) => !existing.has(topic.topic));

    if (wanted.length > 0) {
      await admin.createTopics({waitForLeaders: true, topics: wanted});
      console.log(`==playback: created kafka topics ${wanted.map((t) => t.topic).join(", ")}`);
    }
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
};

/**
 * How far the compacted topic goes, so we know when the replay is done.
 * An empty topic (high == low) is "done" immediately.
 */
const endOffsets = async (): Promise<Map<number, number>> => {
  const admin = client!.admin();
  await admin.connect();
  try {
    const offsets = await admin.fetchTopicOffsets(cfg.stateTopic);
    return new Map(offsets.map((o) => [o.partition, Number(o.high)]));
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
};

export const initKafka = async (handler: StateHandler): Promise<void> => {
  onState = handler;
  if (!cfg.enabled) {
    console.warn("==playback: KAFKA_BROKERS is not set — state is kept in memory only");
    return;
  }

  client = new Kafka({
    clientId: cfg.clientId,
    brokers: cfg.brokers,
    logLevel: logLevel.WARN,
    retry: {retries: 5, initialRetryTime: 300},
  });

  replayed = new Promise<void>((resolve) => {
    replayResolve = resolve;
  });

  try {
    await ensureTopics();

    producer = client.producer({idempotent: true, maxInFlightRequests: 1});
    await producer.connect();

    // A fresh group id per boot: this consumer is not a worker pool member, it
    // is a materializer — every replica must see EVERY record, not a share of
    // them. Groups without members age out on their own (offsets.retention).
    consumer = client.consumer({groupId: `${cfg.clientId}-state-${randomUUID()}`});
    await consumer.connect();
    await consumer.subscribe({topic: cfg.stateTopic, fromBeginning: true});

    const targets = await endOffsets();
    const reached = new Map<number, number>();
    const checkReplayed = (): void => {
      if (!replayResolve) return;
      for (const [partition, high] of targets) {
        if (high > 0 && (reached.get(partition) ?? -1) < high - 1) return;
      }
      replayResolve();
      replayResolve = null;
      console.log("==playback: kafka state replay complete");
    };
    checkReplayed(); // empty topic: nothing to wait for

    await consumer.run({
      eachMessage: async ({partition, message}) => {
        reached.set(partition, Number(message.offset));
        if (message.value) {
          try {
            onState(JSON.parse(message.value.toString()) as PlaybackState);
          } catch (error) {
            console.error("==playback: bad state record:", (error as Error)?.message ?? error);
          }
        }
        checkReplayed();
      },
    });

    connected = true;
    console.log(`==playback: kafka connected (${cfg.brokers.join(",")})`);
  } catch (error) {
    connected = false;
    console.error("==playback: kafka unavailable, state stays in memory:", (error as Error)?.message ?? error);
  }

  // never block the API on a broker that will not come up
  const guard = setTimeout(() => {
    if (replayResolve) {
      console.warn("==playback: kafka replay timed out — serving what we have");
      replayResolve();
      replayResolve = null;
    }
  }, cfg.replayTimeoutMs);
  guard.unref?.();
};

/** Publish the new truth. Fire-and-forget: the caller already applied it locally. */
export const publishState = async (state: PlaybackState): Promise<void> => {
  if (!producer || !connected) return;
  try {
    await producer.send({
      topic: cfg.stateTopic,
      messages: [{key: state.user_id, value: JSON.stringify(state)}],
    });
  } catch (error) {
    console.error("==playback: could not publish state:", (error as Error)?.message ?? error);
  }
};

export const publishEvent = async (event: PlaybackEvent): Promise<void> => {
  if (!producer || !connected) return;
  try {
    await producer.send({
      topic: cfg.eventsTopic,
      messages: [{key: event.user_id, value: JSON.stringify(event)}],
    });
  } catch (error) {
    console.error("==playback: could not publish event:", (error as Error)?.message ?? error);
  }
};

export const shutdownKafka = async (): Promise<void> => {
  connected = false;
  await consumer?.disconnect().catch(() => undefined);
  await producer?.disconnect().catch(() => undefined);
  consumer = null;
  producer = null;
  client = null;
};

// src/index.ts
import { AddressInfo } from "net";
import { PORT } from "@/configurations";
import app from "@/router";
import { initDataSource } from "@/configurations/typeorm.config";
import { initKafka, shutdownKafka, whenReplayed } from "@/services/kafka";
import { applyRemoteState, guardRestoredSessions } from "@/services/playback";
import { attachPlaybackSocket, WS_PATH } from "@/ws/hub";
//export * from "./helpers/strategies";


const server = app.listen(PORT, '0.0.0.0', () => {
  const { address, port } = server.address() as AddressInfo;
  const ip = address === '::' || address === '::1' ? '127.0.0.1' : address;
  console.log(`Listening at http://${ip}:${port}`)
});

// Cross-device playback. Both dependencies are optional: without Postgres the
// device registry is per-process, without Kafka the playback state is. The
// socket, and therefore the feature, works either way — it just stops being
// durable and stops fanning out to other replicas.
void initDataSource().catch(() => null);
void initKafka(applyRemoteState).then(() => whenReplayed()).then(guardRestoredSessions);
attachPlaybackSocket(server);
console.log(`Playback socket at ws://0.0.0.0:${PORT}${WS_PATH}`);

const shutdown = (signal: string) => {
  console.log(`==${signal}: shutting down`);
  server.close(() => undefined);
  void shutdownKafka().finally(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

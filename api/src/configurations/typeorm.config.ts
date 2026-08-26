import "reflect-metadata";
import {DataSource} from 'typeorm';
import {db} from '@/configurations/playback';
import {User} from '@/db/entities/User';
import {Device} from '@/db/entities/Device';
import {FriskyArtist} from '@/db/entities/FriskyArtist';
import {FriskyMix} from '@/db/entities/FriskyMix';
import {VkTrack} from '@/db/entities/VkTrack';
import {PlaybackDevices1756100000000} from '@/db/migrations/1756100000000-PlaybackDevices';
import {FriskyCache1756600000000} from '@/db/migrations/1756600000000-FriskyCache';

/**
 * Entities and migrations are listed explicitly rather than globbed: the API
 * ships as a single esbuild bundle, where a `src/**` glob resolves to nothing.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: db.host || 'localhost',
  port: db.port,
  username: db.username,
  password: db.password,
  database: db.database,
  synchronize: db.synchronize,
  logging: db.logging,
  entities: [User, Device, FriskyArtist, FriskyMix, VkTrack],
  migrations: [PlaybackDevices1756100000000, FriskyCache1756600000000],
  subscribers: [],
});

let initializing: Promise<DataSource> | null = null;

/**
 * Connect on first use and run migrations.
 *
 * Returns null when no DB is configured (`DB_HOST` unset) or the connection
 * fails: the device registry then keeps its rows in memory, which is enough for
 * a single replica and for tests. Playback itself never depends on Postgres.
 */
export const initDataSource = async (): Promise<DataSource | null> => {
  if (!db.enabled) {
    console.warn("==playback: DB_HOST is not set — device registry runs in memory only");
    return null;
  }
  if (AppDataSource.isInitialized) return AppDataSource;
  if (!initializing) {
    initializing = AppDataSource.initialize()
      .then(async (ds) => {
        await ds.runMigrations();
        console.log(`==playback: postgres connected (${db.host}:${db.port}/${db.database})`);
        return ds;
      })
      .catch((error) => {
        console.error("==playback: postgres unavailable, falling back to memory:", error?.message ?? error);
        initializing = null;
        throw error;
      });
  }
  return initializing.catch(() => null);
};

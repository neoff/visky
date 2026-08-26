// src/db/migrations/1756600000000-FriskyCache.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * The frisky.fm metadata cache.
 *
 * `vk_tracks` is the playlist as it was served, WITHOUT the audio urls — those
 * are signed per token/device and are always re-read from VK. `frisky_artists`
 * and `frisky_mixes` are a mirror of api.frisky.fm, filled by the background
 * worker and merged into the next playlist response.
 */
export class FriskyCache1756600000000 implements MigrationInterface {
  name = "FriskyCache1756600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "frisky_artists" (
        "id" int PRIMARY KEY,
        "title" text,
        "key" text NOT NULL,
        "url" text,
        "genre" jsonb,
        "biography" text,
        "home_city" text,
        "photo_url" text,
        "photo_thumb_url" text,
        "links" jsonb,
        "reach" bigint,
        "fetched_at" timestamptz,
        "mixes_synced_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_frisky_artists_key" ON "frisky_artists" ("key")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "frisky_mixes" (
        "id" int PRIMARY KEY,
        "title" text,
        "url" text,
        "artist_id" int,
        "artist_key" text NOT NULL DEFAULT '',
        "artist_title" text,
        "title_key" text NOT NULL DEFAULT '',
        "period_year" int,
        "period_month" int,
        "period_day" int,
        "air_date" timestamptz,
        "show_id" int,
        "show_title" text,
        "episode_id" int,
        "genre" jsonb,
        "track_list" jsonb,
        "artwork" text,
        "reach" bigint,
        "favorite_count" int,
        "fetched_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_frisky_mixes_artist" ON "frisky_mixes" ("artist_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_frisky_mixes_artist_key" ON "frisky_mixes" ("artist_key")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vk_tracks" (
        "track_id" text PRIMARY KEY,
        "owner_id" bigint NOT NULL,
        "audio_id" bigint NOT NULL,
        "artist" text,
        "title" text,
        "duration" int,
        "date" bigint,
        "artwork" text,
        "artist_key" text,
        "title_key" text,
        "period_year" int,
        "period_month" int,
        "period_day" int,
        "part" int,
        "frisky_mix_id" int,
        "match_score" real,
        "match_state" text NOT NULL DEFAULT 'pending',
        "matched_at" timestamptz,
        "last_seen" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vk_tracks_artist_key" ON "vk_tracks" ("artist_key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vk_tracks_match_state" ON "vk_tracks" ("match_state")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vk_tracks_match_state"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vk_tracks_artist_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vk_tracks"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_frisky_mixes_artist_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_frisky_mixes_artist"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "frisky_mixes"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_frisky_artists_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "frisky_artists"`);
  }
}

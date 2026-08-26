// src/db/migrations/1756700000000-FriskyEpisodes.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * Episodes: the identity a broadcast actually has.
 *
 * A show longer than an hour is cut into pieces on BOTH sides — VK because it
 * caps a track at an hour, frisky for its own reasons — and `episode_id` is what
 * says the pieces are one broadcast. Part 1 and Part 2 of a VK show therefore
 * resolve to one episode and share its tracklist, which is the whole point: the
 * tracklist frequently sits on only one mix of an episode (episode 7486 has
 * fourteen mixes and one of them carries all 25 tracks).
 *
 * `air_start` comes from the episode record and replaces the date guessed out of
 * the mix slug.
 */
export class FriskyEpisodes1756700000000 implements MigrationInterface {
  name = "FriskyEpisodes1756700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "frisky_mixes" ADD COLUMN IF NOT EXISTS "episode_title" text`);
    await queryRunner.query(`ALTER TABLE "frisky_mixes" ADD COLUMN IF NOT EXISTS "air_start" timestamptz`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_frisky_mixes_episode" ON "frisky_mixes" ("episode_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_frisky_mixes_title_key" ON "frisky_mixes" ("title_key")`);

    await queryRunner.query(`ALTER TABLE "vk_tracks" ADD COLUMN IF NOT EXISTS "frisky_episode_id" int`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vk_tracks_episode" ON "vk_tracks" ("frisky_episode_id")`);

    // The artist directory is no longer mirrored wholesale — /search resolves an
    // artist from the same call that finds the mixes — so rows that were only
    // ever a directory stub are dropped. Anything with real detail stays.
    await queryRunner.query(`
      DELETE FROM "frisky_artists"
      WHERE "biography" IS NULL AND "photo_url" IS NULL AND "mixes_synced_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vk_tracks_episode"`);
    await queryRunner.query(`ALTER TABLE "vk_tracks" DROP COLUMN IF EXISTS "frisky_episode_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_frisky_mixes_title_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_frisky_mixes_episode"`);
    await queryRunner.query(`ALTER TABLE "frisky_mixes" DROP COLUMN IF EXISTS "air_start"`);
    await queryRunner.query(`ALTER TABLE "frisky_mixes" DROP COLUMN IF EXISTS "episode_title"`);
  }
}

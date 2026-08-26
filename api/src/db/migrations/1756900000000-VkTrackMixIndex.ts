// src/db/migrations/1756900000000-VkTrackMixIndex.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * `vk_tracks.frisky_mix_id` had no index — only `frisky_episode_id` did — and
 * the show backfill joins on it every worker pass.
 */
export class VkTrackMixIndex1756900000000 implements MigrationInterface {
  name = "VkTrackMixIndex1756900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vk_tracks_mix" ON "vk_tracks" ("frisky_mix_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vk_tracks_mix"`);
  }
}

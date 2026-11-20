// src/db/migrations/1757200000000-VkTrackFavoriteOf.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * `vk_tracks.favorite_of`: on a user's COPY of a track, the group's original
 * it was copied from.
 *
 * `audio.add` gives the copy a new id, and the API used to find it again by
 * artist + title — which stopped telling two editions of a monthly show apart
 * once the air month was cut out of the title. The link is written when the
 * heart is pressed and read by id afterwards.
 */
export class VkTrackFavoriteOf1757200000000 implements MigrationInterface {
  name = "VkTrackFavoriteOf1757200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vk_tracks" ADD COLUMN IF NOT EXISTS "favorite_of" text`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_vk_tracks_favorite_of" ON "vk_tracks" ("favorite_of")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vk_tracks_favorite_of"`);
    await queryRunner.query(`ALTER TABLE "vk_tracks" DROP COLUMN IF EXISTS "favorite_of"`);
  }
}

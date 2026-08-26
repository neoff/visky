// src/db/migrations/1756800000000-FriskyShows.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * Show artwork.
 *
 * `/v3/mixes` carries no `image` field — only episodes and shows do — so a mix
 * paged in by artist had nothing to draw with and the merge fell through to the
 * artist's PHOTO. The list showed a picture of the DJ where the programme's
 * cover belongs. Shows are cached here and the artist photo is no longer an
 * artwork fallback at all.
 */
export class FriskyShows1756800000000 implements MigrationInterface {
  name = "FriskyShows1756800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "frisky_shows" (
        "id" int PRIMARY KEY,
        "title" text,
        "url" text,
        "summary" text,
        "channel" text,
        "genre" jsonb,
        "artist_id" int,
        "image_url" text,
        "thumb_url" text,
        "album_art_url" text,
        "fetched_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "frisky_shows"`);
  }
}

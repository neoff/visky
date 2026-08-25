// src/db/migrations/1756100000000-PlaybackDevices.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * Identities for cross-device playback. Only the durable facts live here —
 * "who owns which device", "how do I wake it". The playback state itself is in
 * Kafka (log-compacted, keyed by user id) and never touches Postgres.
 */
export class PlaybackDevices1756100000000 implements MigrationInterface {
  name = "PlaybackDevices1756100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" text PRIMARY KEY,
        "display_name" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "devices" (
        "id" text PRIMARY KEY,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" text,
        "platform" text,
        "app_version" text,
        "push_token" text,
        "last_seen" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_devices_user" ON "devices" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_devices_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}

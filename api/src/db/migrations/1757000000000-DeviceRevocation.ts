// src/db/migrations/1757000000000-DeviceRevocation.ts
import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * Signing another device out.
 *
 * A row rather than a DELETE, and that is the whole design. The revoked device
 * is usually not running when the button is pressed — a phone in a drawer, the
 * desktop app on a machine that is off — so there is nobody to tell. Deleting
 * the row would mean the device comes back, is not known, and is registered
 * again as a brand new one; the sign-out would silently undo itself.
 *
 * Postgres is the store of record for this, not Kafka. The state topic is keyed
 * by user and holds what is PLAYING; whether an installation may still speak for
 * an account is a durable fact about the device, and it has to be answerable on
 * the very first request a cold app makes, before any topic has been replayed.
 */
export class DeviceRevocation1757000000000 implements MigrationInterface {
  name = "DeviceRevocation1757000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz`);
    // Every authenticated request asks "is this device revoked", and it asks by
    // primary key — but the roster read is by user, and it now has to skip the
    // revoked rows.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_devices_user_live" ON "devices" ("user_id") WHERE "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_devices_user_live"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "revoked_at"`);
  }
}

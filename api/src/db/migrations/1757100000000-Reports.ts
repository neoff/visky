import {MigrationInterface, QueryRunner} from "typeorm";

export class Reports1757100000000 implements MigrationInterface {
  name = 'Reports1757100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" SERIAL PRIMARY KEY,
        "kind" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "email" text,
        "status" text NOT NULL DEFAULT 'open',
        "github_issue" int,
        "delivery" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_reports_kind" ON "reports" ("kind")`);
    // the dashboard reads newest first and nothing else
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_reports_created" ON "reports" ("created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
  }
}

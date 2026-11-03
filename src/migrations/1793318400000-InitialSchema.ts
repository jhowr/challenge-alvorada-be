import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written: the exclusion constraint over int4range is the core of the
 * solution and reads better as SQL. Constraint names match the entities.
 */
export class InitialSchema1793318400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Lets a GiST index combine equality on text with range overlap.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

    // COLLATE "C" makes ORDER BY id compare bytes, matching the API's id
    // order regardless of the server's default locale (BR13).
    await queryRunner.query(`
      CREATE TABLE resources (
        id text COLLATE "C" CONSTRAINT resources_pkey PRIMARY KEY
      )`);

    await queryRunner.query(`
      CREATE TABLE bookings (
        -- Cancelled bookings keep their row, so the primary key alone
        -- guarantees that an id is never reused (BR6).
        id           text COLLATE "C" CONSTRAINT bookings_pkey PRIMARY KEY,
        resource_id  text COLLATE "C" NOT NULL
                       CONSTRAINT bookings_resource_id_fkey
                       REFERENCES resources (id),
        -- int4range normalizes to '[)', the half-open period of BR3.
        period       int4range NOT NULL,
        status       text NOT NULL DEFAULT 'active',
        created_at   timestamptz NOT NULL DEFAULT now(),
        cancelled_at timestamptz,
        CONSTRAINT bookings_status_valid
          CHECK (status IN ('active', 'cancelled')),
        CONSTRAINT bookings_period_not_empty CHECK (NOT isempty(period)),
        CONSTRAINT bookings_cancelled_at_matches_status
          CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
        -- No two active bookings of the same resource may overlap (BR3, BR4,
        -- BR7), enforced by the database even under concurrent inserts.
        CONSTRAINT bookings_no_overlap
          EXCLUDE USING gist (resource_id WITH =, period WITH &&)
          WHERE (status = 'active')
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bookings');
    await queryRunner.query('DROP TABLE resources');
  }
}

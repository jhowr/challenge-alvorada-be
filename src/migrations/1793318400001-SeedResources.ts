import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The fixed list of bookable resources. There is no endpoint to manage them,
 * so they are data that ships with the schema.
 */
export class SeedResources1793318400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO resources (id)
      VALUES ('PROJECTOR-1'), ('R1'), ('R2'), ('ROOM-A'), ('ROOM-B')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM resources
       WHERE id IN ('PROJECTOR-1', 'R1', 'R2', 'ROOM-A', 'ROOM-B')`);
  }
}

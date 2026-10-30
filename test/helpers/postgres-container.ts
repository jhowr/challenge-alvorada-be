import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { PostgresResourcesRepository } from '../../src/modules/resources/repositories/postgres-resources.repository.js';
import { RESOURCE_SEED } from '../../src/modules/resources/resources.seed.js';
import { migrate } from '../../src/shared/database/migrate.js';

export interface TestDatabase {
  pool: Pool;
  /** Deletes every booking, keeping the schema and the seeded resources. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Starts a throwaway Postgres (same image as docker-compose), migrated and seeded.
 * Debian-based on purpose: its glibc en_US collation does not sort by bytes,
 * so the BR13 ordering tests fail if COLLATE "C" is ever dropped. Alpine's
 * musl collation sorts by bytes and would hide that regression.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16',
  ).start();
  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 20,
  });
  await migrate(pool);
  await new PostgresResourcesRepository(pool).seed(RESOURCE_SEED);

  return {
    pool,
    reset: async () => {
      await pool.query('TRUNCATE bookings');
    },
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import {
  databaseOptions,
  runMigrations,
} from '../../src/config/database.config';

export interface TestDatabase {
  dataSource: DataSource;
  connectionUri: string;
  /** Deletes every booking, keeping the schema and the resources. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Starts a throwaway Postgres (same image as docker-compose), migrated, with
 * the fixed resources.
 * Debian-based on purpose: its glibc en_US collation does not sort by bytes,
 * so the BR13 ordering tests fail if COLLATE "C" is ever dropped. Alpine's
 * musl collation sorts by bytes and would hide that regression.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16',
  ).start();
  const dataSource = await new DataSource({
    ...databaseOptions(container.getConnectionUri()),
    poolSize: 20,
  }).initialize();
  await runMigrations(dataSource);

  return {
    dataSource,
    connectionUri: container.getConnectionUri(),
    reset: async () => {
      await dataSource.query('TRUNCATE bookings');
    },
    stop: async () => {
      await dataSource.destroy();
      await container.stop();
    },
  };
}

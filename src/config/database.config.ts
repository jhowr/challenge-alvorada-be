import { type DynamicModule, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions, MigrationExecutor } from 'typeorm';
import { InitialSchema1793318400000 } from '../migrations/1793318400000-InitialSchema';
import { SeedResources1793318400001 } from '../migrations/1793318400001-SeedResources';
import { BookingEntity } from '../modules/bookings/entities/booking.entity';
import { ResourceEntity } from '../modules/resources/entities/resource.entity';
import { loadConfig } from './env.config';

type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

const logger = new Logger('PgPool');

// Arbitrary key that serializes migration runs of instances booting together.
const MIGRATION_LOCK_KEY = 7_042_026;

/**
 * Connection and pool settings. TypeORM owns the pg Pool: it keeps a dropped
 * connection (database restart, failover, pg_terminate_backend) from crashing
 * the process, evicts it from the pool and closes the pool on shutdown.
 */
export function databaseOptions(url: string): PostgresOptions {
  return {
    type: 'postgres',
    url,
    entities: [ResourceEntity, BookingEntity],
    migrations: [InitialSchema1793318400000, SeedResources1793318400001],
    // The schema, extensions included, only ever comes from migrations.
    synchronize: false,
    installExtensions: false,
    poolSize: 10,
    connectTimeoutMS: 5_000,
    // TypeORM's default handler logs at "warn", which is silent unless
    // logging is enabled.
    poolErrorHandler: (error: Error) =>
      logger.error(`Idle client error: ${error.message}`),
    extra: {
      // Bounds every statement, including lock waits, so a stuck request
      // fails instead of holding a connection forever.
      statement_timeout: 10_000,
      // Rolls back a transaction left open by a crashed or stuck request.
      idle_in_transaction_session_timeout: 10_000,
    },
  };
}

/**
 * Applies pending migrations in a single transaction that first takes an
 * advisory lock, all on one connection. TypeORM does not lock against other
 * instances; the transaction-scoped lock is released by COMMIT/ROLLBACK, or
 * with the migration itself if the connection dies.
 */
export async function runMigrations(dataSource: DataSource): Promise<string[]> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [
      MIGRATION_LOCK_KEY,
    ]);
    // Inside an open transaction the executor neither starts nor commits one.
    const executor = new MigrationExecutor(dataSource, queryRunner);
    executor.transaction = 'all';
    const applied = await executor.executePendingMigrations();
    await queryRunner.commitTransaction();
    return applied.map((migration) => migration.name);
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction().catch(() => undefined);
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/**
 * The TypeORM connection, migrated before the app starts serving. If the
 * database is unreachable or a migration fails, the app does not start.
 */
export function databaseModule(): DynamicModule {
  return TypeOrmModule.forRootAsync({
    // Reads the config when the app is built, not when this file is imported.
    useFactory: () => ({
      ...databaseOptions(loadConfig().DATABASE_URL),
      // Fail fast at boot instead of @nestjs/typeorm's 10 retries, each of
      // which would build a new DataSource.
      retryAttempts: 0,
    }),
    dataSourceFactory: async (options) => {
      const dataSource = await new DataSource(options!).initialize();
      try {
        await runMigrations(dataSource);
      } catch (error) {
        await dataSource.destroy();
        throw error;
      }
      return dataSource;
    },
  });
}

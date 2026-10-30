import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Pool } from 'pg';
import { migrate } from './migrate.js';

export const PG_POOL = Symbol('PG_POOL');

export const DEFAULT_DATABASE_URL =
  'postgres://booking:booking@localhost:54329/booking';

export function isPostgresDriver(): boolean {
  const driver = process.env.DB_DRIVER ?? 'memory';
  if (driver !== 'memory' && driver !== 'postgres') {
    throw new Error(
      `DB_DRIVER must be "memory" or "postgres", got "${driver}"`,
    );
  }
  return driver === 'postgres';
}

/**
 * Provides a migrated pg Pool when DB_DRIVER=postgres, or null otherwise.
 * Feature modules pick their repository implementation from that.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (): Promise<Pool | null> => {
        if (!isPostgresDriver()) return null;
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
        });
        await migrate(pool);
        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}

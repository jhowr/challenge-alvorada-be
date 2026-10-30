import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { loadConfig } from '../config.js';
import { createPool } from './create-pool.js';
import { migrate } from './migrate.js';

export const PG_POOL = Symbol('PG_POOL');

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
        const config = loadConfig();
        if (config.DB_DRIVER !== 'postgres') return null;
        const pool = createPool(config.DATABASE_URL);
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

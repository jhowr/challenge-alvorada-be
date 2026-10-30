import { Pool } from 'pg';
import { PostgresResourcesRepository } from '../src/modules/resources/repositories/postgres-resources.repository.js';
import { RESOURCE_SEED } from '../src/modules/resources/resources.seed.js';
import { DEFAULT_DATABASE_URL } from '../src/shared/database/database.module.js';
import { migrate } from '../src/shared/database/migrate.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
});
try {
  const applied = await migrate(pool);
  await new PostgresResourcesRepository(pool).seed(RESOURCE_SEED);
  console.log(
    applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Up to date',
  );
} finally {
  await pool.end();
}

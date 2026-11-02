import { PostgresResourcesRepository } from '../src/modules/resources/repositories/postgres-resources.repository.js';
import { RESOURCE_SEED } from '../src/modules/resources/resources.seed.js';
import { loadConfig } from '../src/shared/config.js';
import { createPool } from '../src/shared/database/create-pool.js';
import { migrate } from '../src/shared/database/migrate.js';

const pool = createPool(loadConfig().DATABASE_URL);
try {
  const applied = await migrate(pool);
  await new PostgresResourcesRepository(pool).seed(RESOURCE_SEED);
  console.log(
    applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Up to date',
  );
} finally {
  await pool.end();
}

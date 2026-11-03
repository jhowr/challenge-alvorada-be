import { DataSource } from 'typeorm';
import { databaseOptions, runMigrations } from '../src/config/database.config';
import { loadConfig } from '../src/config/env.config';

const dataSource = await new DataSource(
  databaseOptions(loadConfig().DATABASE_URL),
).initialize();
try {
  const applied = await runMigrations(dataSource);
  console.log(
    applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Up to date',
  );
} finally {
  await dataSource.destroy();
}

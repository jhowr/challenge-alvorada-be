import type { Pool } from 'pg';
import type { ResourcesRepository } from './resources.repository.js';

export class PostgresResourcesRepository implements ResourcesRepository {
  constructor(private readonly pool: Pool) {}

  async seed(ids: readonly string[]): Promise<void> {
    await this.pool.query(
      'INSERT INTO resources (id) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING',
      [ids],
    );
  }

  async list(): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      'SELECT id FROM resources ORDER BY id',
    );
    return rows.map((row) => row.id);
  }

  async exists(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'SELECT 1 FROM resources WHERE id = $1',
      [id],
    );
    return rowCount === 1;
  }
}

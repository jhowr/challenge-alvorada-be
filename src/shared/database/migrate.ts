import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
// Arbitrary key that serializes concurrent migration runs.
const MIGRATION_LOCK_KEY = 7_042_026;

/** Applies pending `migrations/*.sql` files in name order, each in its own transaction. */
export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations',
    );
    const applied = new Set(rows.map((row) => row.name));
    const pending = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql') && !applied.has(file))
      .sort();

    for (const file of pending) {
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [
          file,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    client.release();
  }
}

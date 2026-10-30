import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
// Arbitrary key that serializes concurrent migration runs (e.g. two instances booting).
const MIGRATION_LOCK_KEY = 7_042_026;

/**
 * Applies pending `migrations/*.sql` files in name order, all in a single
 * transaction. The transaction-scoped advisory lock is released by
 * COMMIT/ROLLBACK, even if the connection dies.
 */
export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  let failure: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock($1)', [
      MIGRATION_LOCK_KEY,
    ]);
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
      await client.query(await readFile(new URL(file, MIGRATIONS_DIR), 'utf8'));
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    }
    await client.query('COMMIT');
    return pending;
  } catch (error) {
    failure = error as Error;
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    // Passing the error destroys the client instead of returning a possibly
    // broken connection to the pool.
    client.release(failure);
  }
}

import { Logger } from '@nestjs/common';
import { Pool } from 'pg';

const logger = new Logger('PgPool');

/**
 * A connection that drops (database restart, failover, pg_terminate_backend)
 * emits 'error': on the Pool while the client is idle, on the client itself
 * while it is checked out. Without listeners Node treats it as unhandled and
 * the whole process exits. With them, the failure surfaces as a rejected
 * query and the next checkout opens a new connection.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    // Bounds every statement, including lock waits, so a stuck request fails
    // instead of holding a connection forever.
    statement_timeout: 10_000,
    // Rolls back a transaction left open by a crashed or stuck request.
    idle_in_transaction_session_timeout: 10_000,
  });
  pool.on('error', (error) =>
    logger.error(`Idle client error: ${error.message}`),
  );
  // Once per physical connection, not per checkout, so listeners don't pile up.
  pool.on('connect', (client) =>
    client.on('error', (error) =>
      logger.error(`Client error: ${error.message}`),
    ),
  );
  return pool;
}

import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  Booking,
  BookingFilter,
  NewBooking,
  Period,
} from '../booking.types.js';
import type {
  BookingsRepository,
  InsertBookingError,
} from './bookings.repository.js';

// Read the range boundaries back as integers instead of parsing '[10,20)'.
const COLUMNS = `id, resource_id AS "resourceId", lower(period) AS start,
                 upper(period) AS "end", status`;

const PG_UNIQUE_VIOLATION = '23505';
const PG_EXCLUSION_VIOLATION = '23P01';

type Queryable = Pool | PoolClient;

const violates = (error: unknown, code: string): boolean =>
  error instanceof DatabaseError && error.code === code;

export class PostgresBookingsRepository implements BookingsRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Booking | null> {
    const { rows } = await this.pool.query<Booking>(
      `SELECT ${COLUMNS} FROM bookings WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async list(filter: BookingFilter): Promise<Booking[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status !== undefined) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter.resourceId !== undefined) {
      params.push(filter.resourceId);
      conditions.push(`resource_id = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.pool.query<Booking>(
      `SELECT ${COLUMNS} FROM bookings ${where} ORDER BY id`,
      params,
    );
    return rows;
  }

  async findActiveConflicts(
    resourceId: string,
    period: Period,
    db: Queryable = this.pool,
  ): Promise<Booking[]> {
    // Same predicate as the exclusion constraint, so its GiST index serves it.
    const { rows } = await db.query<Booking>(
      `SELECT ${COLUMNS} FROM bookings
        WHERE resource_id = $1 AND status = 'active'
          AND period && int4range($2, $3, '[)')
        ORDER BY id`,
      [resourceId, period.start, period.end],
    );
    return rows;
  }

  /**
   * Inserts inside a transaction that first locks the resource row.
   *
   * Without the lock, concurrent overlapping inserts wait on each other's
   * uncommitted rows in the exclusion check and deadlock (40P01); Postgres
   * needs `deadlock_timeout` (1s) to notice each one, so throughput collapses
   * under contention. Locking the resource turns that into a short queue per
   * resource, and the conflict check inside the lock is exact. The exclusion
   * constraint stays as the guarantee for any writer that skips this path.
   */
  async insert(
    booking: NewBooking,
  ): Promise<Result<Booking, InsertBookingError>> {
    const client = await this.pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('BEGIN');
      // NO KEY UPDATE blocks other writers of this resource but not the
      // KEY SHARE lock that foreign key checks take.
      const locked = await client.query(
        'SELECT 1 FROM resources WHERE id = $1 FOR NO KEY UPDATE',
        [booking.resourceId],
      );
      if (locked.rowCount === 0) {
        await client.query('ROLLBACK');
        return err({
          code: 'resource_not_found',
          resourceId: booking.resourceId,
        });
      }
      const conflicts = await this.findActiveConflicts(
        booking.resourceId,
        booking,
        client,
      );
      if (conflicts.length > 0) {
        await client.query('ROLLBACK');
        return err({
          code: 'conflict',
          conflictingIds: conflicts.map((conflict) => conflict.id),
        });
      }
      const { rows } = await client.query<Booking>(
        `INSERT INTO bookings (id, resource_id, period)
         VALUES ($1, $2, int4range($3, $4, '[)'))
         RETURNING ${COLUMNS}`,
        [booking.id, booking.resourceId, booking.start, booking.end],
      );
      await client.query('COMMIT');
      return ok(rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Anything but a server-side SQL error means the connection itself
      // failed, so it must not go back to the pool.
      if (!(error instanceof DatabaseError)) broken = error as Error;
      // Same id inserted concurrently on another resource (another lock).
      if (violates(error, PG_UNIQUE_VIOLATION)) {
        return err({ code: 'id_already_used', id: booking.id });
      }
      // Unreachable through this method while the lock is held; kept so a
      // regression surfaces as a conflict instead of a 500.
      if (violates(error, PG_EXCLUSION_VIOLATION)) {
        const conflicts = await this.findActiveConflicts(
          booking.resourceId,
          booking,
        );
        return err({
          code: 'conflict',
          conflictingIds: conflicts.map((conflict) => conflict.id),
        });
      }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  async cancelIfActive(id: string): Promise<Booking | null> {
    const { rows } = await this.pool.query<Booking>(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
        WHERE id = $1 AND status = 'active'
        RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }
}

import { DatabaseError, type Pool } from 'pg';
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
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_DEADLOCK_DETECTED = '40P01';

const MAX_INSERT_ATTEMPTS = 5;

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
  ): Promise<Booking[]> {
    // Same predicate as the exclusion constraint, so its GiST index serves it.
    const { rows } = await this.pool.query<Booking>(
      `SELECT ${COLUMNS} FROM bookings
        WHERE resource_id = $1 AND status = 'active'
          AND period && int4range($2, $3, '[)')
        ORDER BY id`,
      [resourceId, period.start, period.end],
    );
    return rows;
  }

  async insert(
    booking: NewBooking,
  ): Promise<Result<Booking, InsertBookingError>> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.tryInsert(booking);
      } catch (error) {
        // Concurrent overlapping inserts wait on each other's uncommitted rows
        // in the exclusion check and may deadlock; Postgres aborts one of them.
        // The insert is a single atomic statement, so retrying is safe, and by
        // then the winner has committed and the retry reports a plain conflict.
        if (
          attempt < MAX_INSERT_ATTEMPTS &&
          violates(error, PG_DEADLOCK_DETECTED)
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async tryInsert(
    booking: NewBooking,
  ): Promise<Result<Booking, InsertBookingError>> {
    try {
      const { rows } = await this.pool.query<Booking>(
        `INSERT INTO bookings (id, resource_id, period)
         VALUES ($1, $2, int4range($3, $4, '[)'))
         RETURNING ${COLUMNS}`,
        [booking.id, booking.resourceId, booking.start, booking.end],
      );
      return ok(rows[0]!);
    } catch (error) {
      // Only reachable when a concurrent request wins the race after the
      // service's pre-checks; the constraints are the source of truth.
      if (violates(error, PG_UNIQUE_VIOLATION)) {
        return err({ code: 'id_already_used', id: booking.id });
      }
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
      if (violates(error, PG_FOREIGN_KEY_VIOLATION)) {
        return err({
          code: 'resource_not_found',
          resourceId: booking.resourceId,
        });
      }
      throw error;
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

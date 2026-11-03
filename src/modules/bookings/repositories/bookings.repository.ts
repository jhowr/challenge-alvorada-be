import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type EntityManager,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ResourceEntity } from '../../resources/entities/resource.entity';
import {
  ConflictError,
  IdAlreadyUsedError,
  ResourceNotFoundError,
} from '../booking.errors';
import type {
  Booking,
  BookingFilter,
  NewBooking,
  Period,
} from '../booking.types';
import { BookingEntity } from '../entities/booking.entity';

// Read the range boundaries back as integers instead of parsing '[10,20)'.
const COLUMNS = `booking.id AS id, booking.resourceId AS "resourceId",
                 lower(booking.period) AS start, upper(booking.period) AS "end",
                 booking.status AS status`;

const PG_UNIQUE_VIOLATION = '23505';
const PG_EXCLUSION_VIOLATION = '23P01';

const violates = (error: unknown, code: string): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string }).code === code;

/** Every query on bookings. Lists and conflicts come in ascending id order. */
@Injectable()
export class BookingsRepository {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookings: Repository<BookingEntity>,
  ) {}

  private select(
    manager: EntityManager = this.bookings.manager,
  ): SelectQueryBuilder<BookingEntity> {
    return manager.createQueryBuilder(BookingEntity, 'booking').select(COLUMNS);
  }

  async findById(id: string): Promise<Booking | null> {
    const row = await this.select()
      .where('booking.id = :id', { id })
      .getRawOne<Booking>();
    return row ?? null;
  }

  list(filter: BookingFilter): Promise<Booking[]> {
    const query = this.select().orderBy('booking.id');
    if (filter.status !== undefined) {
      query.andWhere('booking.status = :status', { status: filter.status });
    }
    if (filter.resourceId !== undefined) {
      query.andWhere('booking.resourceId = :resourceId', {
        resourceId: filter.resourceId,
      });
    }
    return query.getRawMany<Booking>();
  }

  findActiveConflicts(
    resourceId: string,
    period: Period,
    manager?: EntityManager,
  ): Promise<Booking[]> {
    // Same predicate as the exclusion constraint, so its GiST index serves it.
    return this.select(manager)
      .where('booking.resourceId = :resourceId', { resourceId })
      .andWhere(`booking.status = 'active'`)
      .andWhere(`booking.period && int4range(:start, :end, '[)')`, {
        start: period.start,
        end: period.end,
      })
      .orderBy('booking.id')
      .getRawMany<Booking>();
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
   *
   * A rejection throws before anything is written, so rolling the
   * transaction back only releases the lock.
   *
   * @throws ResourceNotFoundError, ConflictError or IdAlreadyUsedError
   */
  async insert(booking: NewBooking): Promise<Booking> {
    try {
      return await this.bookings.manager.transaction(async (manager) => {
        // NO KEY UPDATE blocks other writers of this resource but not the
        // KEY SHARE lock that foreign key checks take.
        const resource = await manager.findOne(ResourceEntity, {
          where: { id: booking.resourceId },
          lock: { mode: 'for_no_key_update' },
        });
        if (!resource) throw new ResourceNotFoundError(booking.resourceId);
        const conflicts = await this.findActiveConflicts(
          booking.resourceId,
          booking,
          manager,
        );
        if (conflicts.length > 0) {
          throw new ConflictError(conflicts.map((conflict) => conflict.id));
        }
        await manager.insert(BookingEntity, {
          id: booking.id,
          resourceId: booking.resourceId,
          period: `[${booking.start},${booking.end})`,
        });
        return {
          id: booking.id,
          resourceId: booking.resourceId,
          start: booking.start,
          end: booking.end,
          status: 'active' as const,
        };
      });
    } catch (error) {
      // Same id inserted concurrently on another resource (another lock).
      if (violates(error, PG_UNIQUE_VIOLATION)) {
        throw new IdAlreadyUsedError(booking.id);
      }
      // Unreachable through this method while the lock is held; kept so a
      // regression surfaces as a conflict instead of a 500.
      if (violates(error, PG_EXCLUSION_VIOLATION)) {
        const conflicts = await this.findActiveConflicts(
          booking.resourceId,
          booking,
        );
        throw new ConflictError(conflicts.map((conflict) => conflict.id));
      }
      throw error;
    }
  }

  async cancelIfActive(id: string): Promise<Booking | null> {
    const { raw } = await this.bookings
      .createQueryBuilder()
      .update()
      .set({ status: 'cancelled', cancelledAt: () => 'now()' })
      .where(`id = :id AND status = 'active'`, { id })
      .returning(
        `id, resource_id AS "resourceId", lower(period) AS start,
         upper(period) AS "end", status`,
      )
      .execute();
    return (raw as Booking[])[0] ?? null;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../shared/result.js';
import type { ValidationError } from '../../../shared/validation.js';
import { ResourcesService } from '../../resources/services/resources.service.js';
import type {
  Booking,
  BookingNotFoundError,
  CancelOutcome,
  CreateBookingError,
} from '../booking.types.js';
import {
  BOOKINGS_REPOSITORY,
  type BookingsRepository,
} from '../repositories/bookings.repository.js';
import { parseBookingFilter, parseNewBooking } from './booking-validator.js';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(BOOKINGS_REPOSITORY)
    private readonly bookings: BookingsRepository,
    private readonly resources: ResourcesService,
  ) {}

  /**
   * Checks run in a fixed order and the first failure wins (PRD §4):
   * validation → resource → id → overlap. A rejected attempt stores nothing,
   * so its id stays free (BR5).
   */
  async create(input: unknown): Promise<Result<Booking, CreateBookingError>> {
    const parsed = parseNewBooking(input);
    if (!parsed.ok) return parsed;
    const booking = parsed.value;

    if (!(await this.resources.exists(booking.resourceId))) {
      return err({
        code: 'resource_not_found',
        resourceId: booking.resourceId,
      });
    }
    // Cancelled bookings still hold their id (BR6), so look up any status.
    if (await this.bookings.findById(booking.id)) {
      return err({ code: 'id_already_used', id: booking.id });
    }
    const conflicts = await this.bookings.findActiveConflicts(
      booking.resourceId,
      booking,
    );
    if (conflicts.length > 0) {
      return err({
        code: 'conflict',
        conflictingIds: conflicts.map((conflict) => conflict.id),
      });
    }

    // The checks above give precise errors in the sequential case; insert()
    // enforces the same rules atomically for concurrent requests.
    return this.bookings.insert(booking);
  }

  async cancel(
    id: string,
  ): Promise<
    Result<{ outcome: CancelOutcome; booking: Booking }, BookingNotFoundError>
  > {
    const cancelled = await this.bookings.cancelIfActive(id);
    if (cancelled) return ok({ outcome: 'cancelled', booking: cancelled });

    const existing = await this.bookings.findById(id);
    if (!existing) return err({ code: 'booking_not_found', id });
    return ok({ outcome: 'already_cancelled', booking: existing });
  }

  async findById(id: string): Promise<Result<Booking, BookingNotFoundError>> {
    const booking = await this.bookings.findById(id);
    return booking ? ok(booking) : err({ code: 'booking_not_found', id });
  }

  async list(filter: unknown): Promise<Result<Booking[], ValidationError>> {
    const parsed = parseBookingFilter(filter);
    if (!parsed.ok) return parsed;
    return ok(await this.bookings.list(parsed.value));
  }
}

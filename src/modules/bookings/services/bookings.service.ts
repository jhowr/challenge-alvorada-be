import { Injectable } from '@nestjs/common';
import { ResourcesService } from '../../resources/services/resources.service';
import {
  BookingNotFoundError,
  ConflictError,
  IdAlreadyUsedError,
  ResourceNotFoundError,
} from '../booking.errors';
import type {
  Booking,
  BookingFilter,
  CancelOutcome,
  NewBooking,
} from '../booking.types';
import { BookingsRepository } from '../repositories/bookings.repository';

@Injectable()
export class BookingsService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly resources: ResourcesService,
  ) {}

  /**
   * Receives a validated booking (the DTO checks BR1 and BR2 first). The
   * remaining checks run in a fixed order and the first failure wins (PRD §4):
   * resource → id → overlap. A rejected attempt stores nothing, so its id
   * stays free (BR5).
   *
   * @throws ResourceNotFoundError, IdAlreadyUsedError or ConflictError
   */
  async create(booking: NewBooking): Promise<Booking> {
    if (!(await this.resources.exists(booking.resourceId))) {
      throw new ResourceNotFoundError(booking.resourceId);
    }
    // Cancelled bookings still hold their id (BR6), so look up any status.
    if (await this.bookings.findById(booking.id)) {
      throw new IdAlreadyUsedError(booking.id);
    }
    const conflicts = await this.bookings.findActiveConflicts(
      booking.resourceId,
      booking,
    );
    if (conflicts.length > 0) {
      throw new ConflictError(conflicts.map((conflict) => conflict.id));
    }

    // The checks above give precise errors in the sequential case; insert()
    // enforces the same rules atomically for concurrent requests.
    return this.bookings.insert(booking);
  }

  /** @throws BookingNotFoundError */
  async cancel(
    id: string,
  ): Promise<{ outcome: CancelOutcome; booking: Booking }> {
    const cancelled = await this.bookings.cancelIfActive(id);
    if (cancelled) return { outcome: 'cancelled', booking: cancelled };

    const existing = await this.bookings.findById(id);
    if (!existing) throw new BookingNotFoundError(id);
    return { outcome: 'already_cancelled', booking: existing };
  }

  /** @throws BookingNotFoundError */
  async findById(id: string): Promise<Booking> {
    const booking = await this.bookings.findById(id);
    if (!booking) throw new BookingNotFoundError(id);
    return booking;
  }

  list(filter: BookingFilter): Promise<Booking[]> {
    return this.bookings.list(filter);
  }
}

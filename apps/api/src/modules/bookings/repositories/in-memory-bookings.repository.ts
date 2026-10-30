import { compareIds } from '../../../shared/compare-ids.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  Booking,
  BookingFilter,
  NewBooking,
  Period,
} from '../booking.types.js';
import { overlaps } from '../booking-period.js';
import type {
  BookingsRepository,
  InsertBookingError,
} from './bookings.repository.js';

/** Single-process store. Returns copies so callers cannot mutate its state. */
export class InMemoryBookingsRepository implements BookingsRepository {
  private readonly bookings = new Map<string, Booking>();

  findById(id: string): Promise<Booking | null> {
    const booking = this.bookings.get(id);
    return Promise.resolve(booking ? { ...booking } : null);
  }

  list(filter: BookingFilter): Promise<Booking[]> {
    return Promise.resolve(
      this.sorted(
        (booking) =>
          (filter.status === undefined || booking.status === filter.status) &&
          (filter.resourceId === undefined ||
            booking.resourceId === filter.resourceId),
      ),
    );
  }

  findActiveConflicts(resourceId: string, period: Period): Promise<Booking[]> {
    return Promise.resolve(this.activeConflicts(resourceId, period));
  }

  insert(booking: NewBooking): Promise<Result<Booking, InsertBookingError>> {
    if (this.bookings.has(booking.id)) {
      return Promise.resolve(err({ code: 'id_already_used', id: booking.id }));
    }
    const conflicts = this.activeConflicts(booking.resourceId, booking);
    if (conflicts.length > 0) {
      return Promise.resolve(
        err({
          code: 'conflict',
          conflictingIds: conflicts.map((conflict) => conflict.id),
        }),
      );
    }
    const stored: Booking = { ...booking, status: 'active' };
    this.bookings.set(stored.id, stored);
    return Promise.resolve(ok({ ...stored }));
  }

  cancelIfActive(id: string): Promise<Booking | null> {
    const booking = this.bookings.get(id);
    if (!booking || booking.status !== 'active') return Promise.resolve(null);
    booking.status = 'cancelled';
    return Promise.resolve({ ...booking });
  }

  private activeConflicts(resourceId: string, period: Period): Booking[] {
    return this.sorted(
      (booking) =>
        booking.status === 'active' &&
        booking.resourceId === resourceId &&
        overlaps(booking, period),
    );
  }

  private sorted(predicate: (booking: Booking) => boolean): Booking[] {
    return [...this.bookings.values()]
      .filter(predicate)
      .sort((a, b) => compareIds(a.id, b.id))
      .map((booking) => ({ ...booking }));
  }
}

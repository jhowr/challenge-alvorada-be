import type { Result } from '../../../shared/result.js';
import type {
  Booking,
  BookingFilter,
  ConflictError,
  IdAlreadyUsedError,
  NewBooking,
  Period,
  ResourceNotFoundError,
} from '../booking.types.js';

export const BOOKINGS_REPOSITORY = Symbol('BOOKINGS_REPOSITORY');

export type InsertBookingError =
  IdAlreadyUsedError | ConflictError | ResourceNotFoundError;

export interface BookingsRepository {
  findById(id: string): Promise<Booking | null>;

  /** Bookings matching the filter, in ascending id order. */
  list(filter: BookingFilter): Promise<Booking[]>;

  /** Active bookings of the resource overlapping the period, in ascending id order. */
  findActiveConflicts(resourceId: string, period: Period): Promise<Booking[]>;

  /**
   * Stores a new active booking. Implementations must reject a used id or an
   * overlap atomically, even if the caller already checked both.
   */
  insert(booking: NewBooking): Promise<Result<Booking, InsertBookingError>>;

  /** Cancels an active booking. Returns null when it is missing or already cancelled. */
  cancelIfActive(id: string): Promise<Booking | null>;
}

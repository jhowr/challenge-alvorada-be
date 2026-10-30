import type { ValidationError } from '../../shared/validation.js';

export const BOOKING_STATUSES = ['active', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Half-open period `[start, end)`: occupies `start`, frees the resource at `end`. */
export interface Period {
  start: number;
  end: number;
}

export interface NewBooking extends Period {
  id: string;
  resourceId: string;
}

export interface Booking extends NewBooking {
  status: BookingStatus;
}

export interface BookingFilter {
  status?: BookingStatus;
  resourceId?: string;
}

export interface AvailabilityQuery extends Period {
  resourceId: string;
}

export interface Availability extends AvailabilityQuery {
  available: boolean;
  /** Active bookings overlapping the queried period, in ascending id order. */
  conflicts: Booking[];
}

export type CancelOutcome = 'cancelled' | 'already_cancelled';

export interface ResourceNotFoundError {
  code: 'resource_not_found';
  resourceId: string;
}

export interface IdAlreadyUsedError {
  code: 'id_already_used';
  id: string;
}

export interface ConflictError {
  code: 'conflict';
  conflictingIds: string[];
}

export interface BookingNotFoundError {
  code: 'booking_not_found';
  id: string;
}

export type CreateBookingError =
  ValidationError | ResourceNotFoundError | IdAlreadyUsedError | ConflictError;

export type AvailabilityError = ValidationError | ResourceNotFoundError;

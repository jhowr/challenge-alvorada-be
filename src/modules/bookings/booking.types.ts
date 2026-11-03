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

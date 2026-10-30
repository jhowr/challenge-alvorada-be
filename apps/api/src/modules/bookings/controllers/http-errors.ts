import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from '../../../shared/result.js';
import type { ValidationError } from '../../../shared/validation.js';
import type {
  BookingNotFoundError,
  CreateBookingError,
} from '../booking.types.js';

type BookingsError =
  CreateBookingError | BookingNotFoundError | ValidationError;

const STATUS: Record<BookingsError['code'], HttpStatus> = {
  validation_error: HttpStatus.BAD_REQUEST,
  resource_not_found: HttpStatus.NOT_FOUND,
  booking_not_found: HttpStatus.NOT_FOUND,
  id_already_used: HttpStatus.CONFLICT,
  conflict: HttpStatus.CONFLICT,
};

function describe(error: BookingsError): string {
  switch (error.code) {
    case 'validation_error':
      return 'Invalid input';
    case 'resource_not_found':
      return `Resource "${error.resourceId}" does not exist`;
    case 'booking_not_found':
      return `Booking "${error.id}" does not exist`;
    case 'id_already_used':
      return `Booking id "${error.id}" is already used; ids are never reused, even after cancellation`;
    case 'conflict':
      return `The period overlaps active bookings: ${error.conflictingIds.join(', ')}`;
  }
}

/** Returns the value of a successful result or throws the matching HTTP error. */
export function unwrap<T>(result: Result<T, BookingsError>): T {
  if (result.ok) return result.value;
  const { error } = result;
  throw new HttpException(
    { ...error, message: describe(error) },
    STATUS[error.code],
  );
}

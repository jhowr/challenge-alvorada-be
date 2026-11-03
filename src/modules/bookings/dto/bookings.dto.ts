import { Expose, Type } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';
import {
  IsGreaterThan,
  IsIdentifier,
  IsInt32,
} from '../../../shared/validation/validators';
import {
  BOOKING_STATUSES,
  type BookingStatus,
  type CancelOutcome,
} from '../booking.types';

/** BR2: a booking id is an identifier of at most 64 UTF-16 units, not blank. */
const IsBookingId = () =>
  applyDecorators(
    IsIdentifier(),
    MaxLength(64, { message: 'must have at most 64 characters' }),
    Matches(/\S/, { message: 'must not be blank' }),
  );

/**
 * BR1, BR2: body of `POST /bookings`. Periods are stored as Postgres
 * `int4range`, so their boundaries must fit in int32.
 */
export class CreateBookingRequest {
  @IsBookingId()
  id: string;

  @IsIdentifier()
  resourceId: string;

  @IsInt32()
  start: number;

  @IsInt32()
  @IsGreaterThan('start')
  end: number;
}

/**
 * Path of `GET /bookings/:id` and its cancellation. Only what could not be
 * stored is refused (a NUL would make Postgres fail); any other unknown id
 * is simply not found.
 */
export class BookingParamsRequest {
  @IsIdentifier()
  id: string;
}

/** BR12: query of `GET /bookings`. */
export class ListBookingsRequest {
  @IsOptional()
  @IsIn(BOOKING_STATUSES, {
    message: `must be one of: ${BOOKING_STATUSES.join(', ')}`,
  })
  status?: BookingStatus;

  @IsOptional()
  @IsIdentifier()
  resourceId?: string;
}

export class BookingResponse {
  @Expose()
  id: string;

  @Expose()
  resourceId: string;

  @Expose()
  start: number;

  @Expose()
  end: number;

  @Expose()
  status: BookingStatus;
}

export class CancelBookingResponse {
  @Expose()
  outcome: CancelOutcome;

  @Expose()
  @Type(() => BookingResponse)
  booking: BookingResponse;
}

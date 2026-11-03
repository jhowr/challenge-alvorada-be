import { Expose, Type } from 'class-transformer';
import {
  IsGreaterThan,
  IsIdentifier,
  IsInt32,
  ToNumber,
} from '../../../shared/validation/validators';
import { BookingResponse } from './bookings.dto';

/** Path of `GET /resources/:resourceId/availability`. */
export class AvailabilityParamsRequest {
  @IsIdentifier()
  resourceId: string;
}

/** BR10, BR11: query of `GET /resources/:resourceId/availability`. */
export class AvailabilityQueryRequest {
  @ToNumber()
  @IsInt32()
  start: number;

  @ToNumber()
  @IsInt32()
  @IsGreaterThan('start')
  end: number;
}

export class AvailabilityResponse {
  @Expose()
  resourceId: string;

  @Expose()
  start: number;

  @Expose()
  end: number;

  @Expose()
  available: boolean;

  /** Active bookings overlapping the queried period, in ascending id order. */
  @Expose()
  @Type(() => BookingResponse)
  conflicts: BookingResponse[];
}

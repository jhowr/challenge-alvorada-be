import { z } from 'zod';
import { parseWith } from '../../../shared/validation.js';
import { BOOKING_STATUSES } from '../booking.types.js';

// Periods are stored as Postgres `int4range`, so boundaries must fit in int32.
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

const bookingId = z
  .string()
  .min(1, 'must not be empty')
  .max(64, 'must have at most 64 characters')
  .refine((value) => value.length === 0 || value.trim().length > 0, {
    error: 'must not be blank',
  })
  .refine((value) => !/\p{Cc}/u.test(value), {
    error: 'must not contain control characters',
  });

const resourceId = z.string().min(1, 'must not be empty');

const boundary = z
  .number()
  .int('must be an integer')
  .min(INT32_MIN, `must be >= ${INT32_MIN}`)
  .max(INT32_MAX, `must be <= ${INT32_MAX}`);

const startBeforeEnd = {
  error: 'must be greater than start',
  path: ['end'],
};

const newBookingSchema = z
  .object({ id: bookingId, resourceId, start: boundary, end: boundary })
  .refine((booking) => booking.start < booking.end, startBeforeEnd);

const availabilityQuerySchema = z
  .object({ resourceId, start: boundary, end: boundary })
  .refine((query) => query.start < query.end, startBeforeEnd);

const bookingFilterSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  resourceId: resourceId.optional(),
});

/** BR1, BR2: shape, types and `start < end`. Reports every invalid field at once. */
export const parseNewBooking = (input: unknown) =>
  parseWith(newBookingSchema, input);

export const parseAvailabilityQuery = (input: unknown) =>
  parseWith(availabilityQuerySchema, input);

export const parseBookingFilter = (input: unknown) =>
  parseWith(bookingFilterSchema, input);

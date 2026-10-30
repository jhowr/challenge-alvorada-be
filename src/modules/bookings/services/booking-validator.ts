import { z } from 'zod';
import { parseWith } from '../../../shared/validation.js';
import { BOOKING_STATUSES } from '../booking.types.js';

// Periods are stored as Postgres `int4range`, so boundaries must fit in int32.
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/**
 * Any identifier that reaches storage. Control characters (Postgres rejects
 * NUL) and lone UTF-16 surrogates (Postgres would store U+FFFD instead) are
 * refused so both repositories see exactly the same strings.
 */
const identifier = z
  .string()
  .min(1, 'must not be empty')
  .refine((value) => value.isWellFormed(), {
    error: 'must be well-formed Unicode',
  })
  .refine((value) => !/\p{Cc}/u.test(value), {
    error: 'must not contain control characters',
  });

const bookingId = identifier
  .max(64, 'must have at most 64 characters')
  // '' already fails min(1); report it once.
  .refine((value) => value === '' || /\S/.test(value), {
    error: 'must not be blank',
  });

const boundary = z
  .number()
  .int('must be an integer')
  .min(INT32_MIN, `must be >= ${INT32_MIN}`)
  .max(INT32_MAX, `must be <= ${INT32_MAX}`);

const periodShape = { resourceId: identifier, start: boundary, end: boundary };

const startBeforeEnd = (value: { start: number; end: number }) =>
  value.start < value.end;
const startBeforeEndError = {
  error: 'must be greater than start',
  path: ['end'],
};

const newBookingSchema = z
  .object({ id: bookingId, ...periodShape })
  .refine(startBeforeEnd, startBeforeEndError);

const availabilityQuerySchema = z
  .object(periodShape)
  .refine(startBeforeEnd, startBeforeEndError);

// Strict: an unknown key such as `status[]` must not be silently ignored.
const bookingFilterSchema = z.strictObject({
  status: z.enum(BOOKING_STATUSES).optional(),
  resourceId: identifier.optional(),
});

/** BR1, BR2: shape, types and `start < end`. Reports every invalid field at once. */
export const parseNewBooking = (input: unknown) =>
  parseWith(newBookingSchema, input);

export const parseAvailabilityQuery = (input: unknown) =>
  parseWith(availabilityQuerySchema, input);

export const parseBookingFilter = (input: unknown) =>
  parseWith(bookingFilterSchema, input);

/** Whether `id` could belong to a booking at all; malformed ids cannot exist. */
export const isPossibleBookingId = (id: string): boolean =>
  bookingId.safeParse(id).success;

import {
  type ClassConstructor,
  instanceToPlain,
  plainToInstance,
} from 'class-transformer';
import { minute } from '../../../../test/helpers/minutes';
import {
  invalidFields,
  validateRequest,
} from '../../../../test/helpers/validate-request';
import {
  BookingParamsRequest,
  BookingResponse,
  CancelBookingResponse,
  CreateBookingRequest,
  ListBookingsRequest,
} from './bookings.dto';

const valid = { id: 'A', resourceId: 'R1', start: 10, end: 20 };

describe('CreateBookingRequest', () => {
  it('accepts a valid booking as an instance of the DTO', async () => {
    const result = await validateRequest(CreateBookingRequest, valid);

    expect(result.ok && result.value).toBeInstanceOf(CreateBookingRequest);
    expect(result).toMatchObject({ ok: true, value: valid });
  });

  it('accepts negative and int32 boundary values', async () => {
    const result = await validateRequest(CreateBookingRequest, {
      ...valid,
      start: -(2 ** 31),
      end: 2 ** 31 - 1,
    });

    expect(result.ok).toBe(true);
  });

  it('accepts minutes since epoch from year 0001 to 6000', async () => {
    const result = await validateRequest(CreateBookingRequest, {
      ...valid,
      start: minute('0001-01-01T00:00Z'),
      end: minute('6000-01-01T00:00Z'),
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a minute beyond int32, which caps the convention near 6053', async () => {
    expect(
      await invalidFields(CreateBookingRequest, {
        ...valid,
        end: minute('7000-01-01T00:00Z'),
      }),
    ).toEqual(['end']);
  });

  it('rejects a millisecond timestamp, which is not a minute', async () => {
    const ms = Date.parse('2026-11-02T09:00Z');

    expect(
      await invalidFields(CreateBookingRequest, {
        ...valid,
        start: ms,
        end: ms + 60_000,
      }),
    ).toEqual(['start', 'end']);
  });

  it.each([
    ['start equals end', { start: 10, end: 10 }, ['end']],
    ['start after end', { start: 20, end: 10 }, ['end']],
    ['decimal start', { start: 1.5 }, ['start']],
    ['NaN end', { end: Number.NaN }, ['end']],
    ['Infinity end', { end: Number.POSITIVE_INFINITY }, ['end']],
    ['numeric string start', { start: '10' }, ['start']],
    ['end beyond int32', { end: 2 ** 31 }, ['end']],
    ['empty id', { id: '' }, ['id']],
    ['blank id', { id: '   ' }, ['id']],
    ['id with a control character', { id: 'A\u0000' }, ['id']],
    ['id with a lone surrogate', { id: '\ud800' }, ['id']],
    ['id longer than 64 chars', { id: 'x'.repeat(65) }, ['id']],
    ['numeric id', { id: 1 }, ['id']],
    ['empty resourceId', { resourceId: '' }, ['resourceId']],
    ['an unknown field', { status: 'cancelled' }, ['status']],
  ])('BR1/BR2 — rejects %s', async (_label, override, fields) => {
    expect(
      await invalidFields(CreateBookingRequest, { ...valid, ...override }),
    ).toEqual(fields);
  });

  it.each([
    [{ id: 1 }, 'id', 'must be a string'],
    [{ id: '' }, 'id', 'must not be empty'],
    [{ id: '\ud800' }, 'id', 'must be well-formed Unicode'],
    [{ id: 'A\u0000' }, 'id', 'must not contain control characters'],
    [{ id: 'x'.repeat(65) }, 'id', 'must have at most 64 characters'],
    [{ id: '   ' }, 'id', 'must not be blank'],
    [{ start: 1.5 }, 'start', 'must be an integer'],
    [{ end: null }, 'end', 'must be an integer'],
    [{ start: -(2 ** 31) - 1 }, 'start', 'must be >= -2147483648'],
    [{ end: 2 ** 31 }, 'end', 'must be <= 2147483647'],
    [{ end: 10 }, 'end', 'must be greater than start'],
  ])('explains %j as %s: %s', async (override, field, reason) => {
    expect(
      await validateRequest(CreateBookingRequest, { ...valid, ...override }),
    ).toEqual({ ok: false, details: [{ field, reason }] });
  });

  it('explains each problem once per field, unknown properties first', async () => {
    const result = await validateRequest(CreateBookingRequest, {
      id: '',
      resourceId: 'R1',
      start: 20,
      end: 10,
      status: 'cancelled',
    });

    expect(result).toEqual({
      ok: false,
      details: [
        { field: 'status', reason: 'is not allowed' },
        { field: 'id', reason: 'must not be empty' },
        { field: 'end', reason: 'must be greater than start' },
      ],
    });
  });

  it('reports every invalid field at once', async () => {
    expect(
      await invalidFields(CreateBookingRequest, { id: '', start: 'x' }),
    ).toEqual(['id', 'resourceId', 'start', 'end']);
  });

  it.each([[[]], [null], ['A']])(
    'rejects a body that is not an object (%j)',
    async (body) => {
      expect(await validateRequest(CreateBookingRequest, body)).toEqual({
        ok: false,
        details: [{ field: '(input)', reason: 'must be a JSON object' }],
      });
    },
  );
});

describe('BookingParamsRequest', () => {
  it('accepts any storable id, even one too long to exist', async () => {
    const id = 'x'.repeat(65);
    const result = await validateRequest(BookingParamsRequest, { id }, 'param');

    expect(result.ok && result.value.id).toBe(id);
  });

  it('refuses an id Postgres could not compare', async () => {
    expect(
      await invalidFields(BookingParamsRequest, { id: 'A\u0000' }, 'param'),
    ).toEqual(['id']);
  });
});

describe('ListBookingsRequest', () => {
  it('accepts an empty filter and both filters together', async () => {
    expect((await validateRequest(ListBookingsRequest, {}, 'query')).ok).toBe(
      true,
    );
    expect(
      await validateRequest(
        ListBookingsRequest,
        { status: 'cancelled', resourceId: 'R1' },
        'query',
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ['an unknown status', { status: 'deleted' }, ['status']],
    ['a repeated status', { status: ['active', 'cancelled'] }, ['status']],
    [
      'a resource with a control character',
      { resourceId: 'R1\u0000' },
      ['resourceId'],
    ],
    ['an unknown filter', { unknown: '1' }, ['unknown']],
  ])('rejects %s', async (_label, query, fields) => {
    expect(await invalidFields(ListBookingsRequest, query, 'query')).toEqual(
      fields,
    );
  });
});

// What ClassSerializerInterceptor does with @SerializeOptions({ type }).
const serialize = (type: ClassConstructor<object>, value: object) => {
  const options = { excludeExtraneousValues: true };
  return instanceToPlain(plainToInstance(type, value, options), options);
};

describe('response DTOs', () => {
  it('expose only the declared properties', () => {
    const booking = {
      id: 'A',
      resourceId: 'R1',
      start: 10,
      end: 20,
      status: 'active' as const,
      createdAt: new Date(),
    };

    expect(serialize(BookingResponse, booking)).toEqual({
      id: 'A',
      resourceId: 'R1',
      start: 10,
      end: 20,
      status: 'active',
    });
    expect(
      serialize(CancelBookingResponse, {
        outcome: 'cancelled',
        booking: { ...booking, status: 'cancelled' },
        extra: true,
      }),
    ).toEqual({
      outcome: 'cancelled',
      booking: {
        id: 'A',
        resourceId: 'R1',
        start: 10,
        end: 20,
        status: 'cancelled',
      },
    });
  });
});

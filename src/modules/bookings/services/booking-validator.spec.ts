import {
  parseAvailabilityQuery,
  parseBookingFilter,
  parseNewBooking,
} from './booking-validator.js';

const valid = { id: 'A', resourceId: 'R1', start: 10, end: 20 };

function invalidFields(input: unknown): string[] {
  const result = parseNewBooking(input);
  if (result.ok) throw new Error('expected a validation error');
  return result.error.details.map((issue) => issue.field);
}

describe('parseNewBooking', () => {
  it('accepts a valid booking and drops unknown fields', () => {
    expect(parseNewBooking({ ...valid, extra: true })).toEqual({
      ok: true,
      value: valid,
    });
  });

  it('accepts negative and int32 boundary values', () => {
    expect(
      parseNewBooking({ ...valid, start: -(2 ** 31), end: 2 ** 31 - 1 }).ok,
    ).toBe(true);
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
    ['id longer than 64 chars', { id: 'x'.repeat(65) }, ['id']],
    ['numeric id', { id: 1 }, ['id']],
    ['empty resourceId', { resourceId: '' }, ['resourceId']],
  ])('BR1/BR2 — rejects %s', (_label, override, fields) => {
    expect(invalidFields({ ...valid, ...override })).toEqual(fields);
  });

  it('reports every invalid field at once', () => {
    expect(invalidFields({ id: '', start: 'x' })).toEqual([
      'id',
      'resourceId',
      'start',
      'end',
    ]);
  });

  it.each([null, undefined, 'A', []])(
    'rejects a non-object input (%j)',
    (input) => {
      expect(invalidFields(input)).toEqual(['(input)']);
    },
  );
});

describe('parseAvailabilityQuery', () => {
  it('BR11 — applies the same period rules as a booking', () => {
    const result = parseAvailabilityQuery({
      resourceId: 'R1',
      start: 5,
      end: 5,
    });
    expect(result.ok).toBe(false);
  });
});

describe('parseBookingFilter', () => {
  it('accepts an empty filter', () => {
    expect(parseBookingFilter({})).toEqual({ ok: true, value: {} });
  });

  it('rejects an unknown status', () => {
    expect(parseBookingFilter({ status: 'deleted' }).ok).toBe(false);
  });
});

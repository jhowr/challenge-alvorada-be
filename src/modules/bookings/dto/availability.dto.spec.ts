import {
  invalidFields,
  validateRequest,
} from '../../../../test/helpers/validate-request';
import {
  AvailabilityParamsRequest,
  AvailabilityQueryRequest,
} from './availability.dto';

describe('AvailabilityQueryRequest', () => {
  it('turns numeric query strings into numbers', async () => {
    expect(
      await validateRequest(
        AvailabilityQueryRequest,
        { start: '-5', end: '2147483647' },
        'query',
      ),
    ).toMatchObject({ ok: true, value: { start: -5, end: 2 ** 31 - 1 } });
  });

  it.each([
    ['an empty start', { start: '', end: '10' }, ['start']],
    ['a non-numeric start', { start: 'abc', end: '10' }, ['start']],
    ['exponent notation', { start: '1e3', end: '2000' }, ['start']],
    ['a missing end', { start: '10' }, ['end']],
    ['a decimal start', { start: '10.5', end: '20' }, ['start']],
    ['BR11 — an empty period', { start: '10', end: '10' }, ['end']],
    ['a repeated start', { start: ['1', '2'], end: '10' }, ['start']],
    ['an unknown parameter', { start: '1', end: '2', at: '3' }, ['at']],
  ])('rejects %s', async (_label, query, fields) => {
    expect(
      await invalidFields(AvailabilityQueryRequest, query, 'query'),
    ).toEqual(fields);
  });
});

describe('AvailabilityParamsRequest', () => {
  it('rejects a resource id with a control character', async () => {
    expect(
      await invalidFields(
        AvailabilityParamsRequest,
        { resourceId: 'R1\u0000' },
        'param',
      ),
    ).toEqual(['resourceId']);
  });
});

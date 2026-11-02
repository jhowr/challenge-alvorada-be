import { hour } from '../../../test/helpers/hours.js';
import { overlaps } from './booking-period.js';

describe('overlaps', () => {
  const booked = { start: 10, end: 20 };

  it.each([
    ['ends exactly when the booking starts', 0, 10, false],
    ['starts exactly when the booking ends', 20, 30, false],
    ['is entirely before', 0, 5, false],
    ['is entirely after', 25, 30, false],
    ['overlaps the start', 5, 11, true],
    ['overlaps the end', 19, 25, true],
    ['is identical', 10, 20, true],
    ['is contained', 12, 18, true],
    ['contains the booking', 0, 30, true],
    ['is a single unit at the first slot', 10, 11, true],
    ['is a single unit at the last slot', 19, 20, true],
  ])(
    'BR3 — a period that %s [%i,%i) overlaps: %s',
    (_label, start, end, expected) => {
      expect(overlaps(booked, { start, end })).toBe(expected);
      expect(overlaps({ start, end }, booked)).toBe(expected);
    },
  );
});

describe('overlaps with hours since epoch', () => {
  const at = (from: string, to: string) => ({
    start: hour(`2026-11-${from}:00Z`),
    end: hour(`2026-11-${to}:00Z`),
  });
  const meeting = at('02T09', '02T11');

  it.each([
    ['the next meeting starting when it ends', at('02T11', '02T12'), false],
    ['the previous meeting ending when it starts', at('02T08', '02T09'), false],
    ['a meeting sharing its last hour', at('02T10', '02T12'), true],
    ['the same hours on the next day', at('03T09', '03T11'), false],
    ['a night shift crossing midnight', at('01T22', '02T10'), true],
  ])('a 09:00–11:00 meeting vs %s overlaps: %s', (_label, other, expected) => {
    expect(overlaps(meeting, other)).toBe(expected);
    expect(overlaps(other, meeting)).toBe(expected);
  });
});

import { overlaps } from './period.js';

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

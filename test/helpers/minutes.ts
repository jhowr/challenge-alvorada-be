const MS_PER_MINUTE = 60_000;

/**
 * The web panel's reading of a period boundary: a whole minute counted from
 * 1970-01-01T00:00Z, so one integer carries the day, hour and minute. The
 * API itself is unit-agnostic; tests use this to pin that the convention holds.
 */
export function minute(iso: string): number {
  const minutes = Date.parse(iso) / MS_PER_MINUTE;
  if (!Number.isInteger(minutes)) {
    throw new Error(`${iso} is not a whole UTC minute`);
  }
  return minutes;
}

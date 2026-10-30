const MS_PER_HOUR = 3_600_000;

/**
 * The web panel's reading of a period boundary: a whole hour counted from
 * 1970-01-01T00:00Z, so one integer carries both the day and the hour. The
 * API itself is unit-agnostic; tests use this to pin that the convention holds.
 */
export function hour(iso: string): number {
  const hours = Date.parse(iso) / MS_PER_HOUR;
  if (!Number.isInteger(hours)) {
    throw new Error(`${iso} is not a whole UTC hour`);
  }
  return hours;
}

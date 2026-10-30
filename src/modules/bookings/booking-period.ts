import type { Period } from '../booking.types.js';

/**
 * Two half-open periods `[start, end)` overlap when each one starts before the
 * other ends. Strict `<` is what lets `[10,20)` and `[20,30)` coexist (BR3).
 */
export function overlaps(a: Period, b: Period): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Geometry of the day grid: one column per hour of the local day. Pure, so the
 * placement rules (clipping at midnight, the half-open end) are unit-tested.
 */

export interface Span {
  start: number
  end: number
}

export interface Placement {
  /** Percent offsets inside the day track. */
  left: number
  width: number
  /** The period continues before the day starts / after it ends. */
  continuesBefore: boolean
  continuesAfter: boolean
}

/** Where a period sits on the track of `day`, or null when it is outside it. */
export function placeOnDay(period: Span, day: Span): Placement | null {
  // Half-open on both sides: [9, 10) touches the day [10, 34) but is not on it.
  if (period.end <= day.start || period.start >= day.end) return null
  const hours = day.end - day.start
  const start = Math.max(period.start, day.start)
  const end = Math.min(period.end, day.end)
  return {
    left: ((start - day.start) / hours) * 100,
    width: ((end - start) / hours) * 100,
    continuesBefore: period.start < day.start,
    continuesAfter: period.end > day.end,
  }
}

/** The hour column under a pointer `x` pixels into a track `width` pixels wide. */
export function hourAt(x: number, width: number, day: Span): number {
  const hours = day.end - day.start
  const column = Math.floor((x / width) * hours)
  return day.start + Math.min(hours - 1, Math.max(0, column))
}

/** The period covered by dragging from one hour column to another, in either direction. */
export function dragSpan(anchor: number, current: number): Span {
  return {
    start: Math.min(anchor, current),
    end: Math.max(anchor, current) + 1,
  }
}

/** Same rule as the API (BR3): `[a, b)` and `[c, d)` overlap when a < d and c < b. */
export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

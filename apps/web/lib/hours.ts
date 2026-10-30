/**
 * The panel's reading of a period boundary: each integer is one whole hour
 * counted from 1970-01-01T00:00Z, so a single number carries day and hour.
 * The API is unit-agnostic; this module is the only place the convention
 * lives in the web app (see docs/DECISIONS.md §3). Display is in the
 * viewer's local time zone.
 */
export const MS_PER_HOUR = 3_600_000

export function hourToDate(hour: number): Date {
  return new Date(hour * MS_PER_HOUR)
}

/** The hour that contains `date` (rounded down to a whole hour). */
export function hourOf(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_HOUR)
}

/** Local midnight of the calendar day that contains `date`. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * The hours of one local calendar day as a half-open range `[start, end)`.
 * Usually 24 hours; a daylight-saving day has 23 or 25.
 */
export function dayRange(day: Date): { start: number; end: number } {
  const midnight = startOfLocalDay(day)
  return {
    start: Math.ceil(midnight.getTime() / MS_PER_HOUR),
    end: Math.ceil(addLocalDays(midnight, 1).getTime() / MS_PER_HOUR),
  }
}

/** `YYYY-MM-DD` of a local day, used in the URL. */
export function toDayParam(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Parses `YYYY-MM-DD` as a local day; anything else falls back to `fallback`. */
export function parseDayParam(value: string | undefined, fallback: Date): Date {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return startOfLocalDay(fallback)
  const [, y, m, d] = match.map(Number)
  const date = new Date(y, m - 1, d)
  const valid =
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  return valid ? date : startOfLocalDay(fallback)
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
})
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
})
const longDayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
})

/** `09:00` */
export function formatTime(hour: number): string {
  return timeFormat.format(hourToDate(hour))
}

/** `02/11 09:00` */
export function formatDateTime(hour: number): string {
  const date = hourToDate(hour)
  return `${dayFormat.format(date)} ${timeFormat.format(date)}`
}

/** `segunda-feira, 2 de novembro` */
export function formatLongDay(day: Date): string {
  return longDayFormat.format(day)
}

/**
 * A period as people read it: `02/11 09:00 – 11:00` on one day,
 * `02/11 22:00 – 03/11 02:00` when it crosses midnight.
 */
export function formatPeriod(start: number, end: number): string {
  const sameDay =
    startOfLocalDay(hourToDate(start)).getTime() ===
    startOfLocalDay(hourToDate(end - 1)).getTime()
  // A period ending exactly at midnight still reads as one day: "22:00 – 00:00".
  const endLabel = sameDay ? formatTime(end) : formatDateTime(end)
  return `${formatDateTime(start)} – ${endLabel}`
}

/** `2 h` */
export function formatDuration(start: number, end: number): string {
  return `${end - start} h`
}

/** The raw integers exactly as the API stores them: `[498225, 498227)`. */
export function formatRaw(start: number, end: number): string {
  return `[${start}, ${end})`
}

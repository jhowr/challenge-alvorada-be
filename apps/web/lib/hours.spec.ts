import {
  dayRange,
  formatDateTime,
  formatPeriod,
  formatRaw,
  hourOf,
  hourToDate,
  parseDayParam,
  toDayParam,
} from "./hours"

// Every test runs in America/Sao_Paulo (UTC-3, no DST since 2019); see
// vitest.config.ts. 2026-11-02 09:00 local is 12:00Z, hour 498228.
const NINE_AM = 498228

describe("hour convention", () => {
  it("maps an integer to the whole UTC hour since the epoch", () => {
    expect(hourToDate(0).toISOString()).toBe("1970-01-01T00:00:00.000Z")
    expect(hourToDate(NINE_AM).toISOString()).toBe("2026-11-02T12:00:00.000Z")
  })

  it("round-trips through a date", () => {
    expect(hourOf(hourToDate(NINE_AM))).toBe(NINE_AM)
  })

  it("rounds a date inside an hour down to that hour", () => {
    expect(hourOf(new Date("2026-11-02T12:59:59Z"))).toBe(NINE_AM)
  })

  it("maps every int32 hour to a valid date", () => {
    expect(Number.isNaN(hourToDate(2 ** 31 - 1).getTime())).toBe(false)
    expect(Number.isNaN(hourToDate(-(2 ** 31)).getTime())).toBe(false)
  })
})

describe("dayRange", () => {
  it("covers the 24 hours of a local day as [start, end)", () => {
    const range = dayRange(new Date(2026, 10, 2, 15))
    expect(range.end - range.start).toBe(24)
    expect(formatDateTime(range.start)).toBe("02/11 00:00")
    expect(formatDateTime(range.end)).toBe("03/11 00:00")
  })

  it("starts the next day exactly where the previous one ends", () => {
    expect(dayRange(new Date(2026, 10, 2)).end).toBe(
      dayRange(new Date(2026, 10, 3)).start
    )
  })
})

describe("formatPeriod", () => {
  it("names the day once for a period inside one day", () => {
    expect(formatPeriod(NINE_AM, NINE_AM + 2)).toBe("02/11 09:00 – 11:00")
  })

  it("names both days when the period crosses midnight", () => {
    expect(formatPeriod(NINE_AM + 13, NINE_AM + 17)).toBe(
      "02/11 22:00 – 03/11 02:00"
    )
  })

  it("keeps a period ending exactly at midnight on its own day", () => {
    expect(formatPeriod(NINE_AM + 13, NINE_AM + 15)).toBe("02/11 22:00 – 00:00")
  })

  it("shows the raw integers as half-open", () => {
    expect(formatRaw(NINE_AM, NINE_AM + 2)).toBe("[498228, 498230)")
  })
})

describe("day param", () => {
  const today = new Date(2026, 10, 2, 15)

  it("round-trips a local day", () => {
    expect(toDayParam(parseDayParam("2026-11-03", today))).toBe("2026-11-03")
  })

  it.each([undefined, "", "03/11/2026", "2026-02-30", "2026-13-01"])(
    "falls back to today for %j",
    (value) => {
      expect(toDayParam(parseDayParam(value, today))).toBe("2026-11-02")
    }
  )
})

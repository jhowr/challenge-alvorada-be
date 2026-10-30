import { dragSpan, hourAt, overlaps, placeOnDay } from "./grid"

const day = { start: 100, end: 124 }

describe("placeOnDay", () => {
  it("places a period inside the day by its hours", () => {
    expect(placeOnDay({ start: 109, end: 111 }, day)).toEqual({
      left: (9 / 24) * 100,
      width: (2 / 24) * 100,
      continuesBefore: false,
      continuesAfter: false,
    })
  })

  it("clips a period that crosses midnight and says it continues", () => {
    expect(placeOnDay({ start: 122, end: 126 }, day)).toMatchObject({
      left: (22 / 24) * 100,
      width: (2 / 24) * 100,
      continuesAfter: true,
    })
    expect(placeOnDay({ start: 98, end: 102 }, day)).toMatchObject({
      left: 0,
      width: (2 / 24) * 100,
      continuesBefore: true,
    })
  })

  it.each([
    ["ends exactly when the day starts", { start: 90, end: 100 }],
    ["starts exactly when the day ends", { start: 124, end: 130 }],
  ])("leaves out a period that %s", (_label, period) => {
    expect(placeOnDay(period, day)).toBeNull()
  })
})

describe("pointer to hour", () => {
  it("maps a pointer to the hour column under it", () => {
    expect(hourAt(0, 960, day)).toBe(100)
    expect(hourAt(41, 960, day)).toBe(101)
    expect(hourAt(959, 960, day)).toBe(123)
  })

  it("clamps a pointer dragged past either edge", () => {
    expect(hourAt(-30, 960, day)).toBe(100)
    expect(hourAt(2000, 960, day)).toBe(123)
  })

  it("selects whole hours whichever way the drag goes", () => {
    expect(dragSpan(109, 111)).toEqual({ start: 109, end: 112 })
    expect(dragSpan(111, 109)).toEqual({ start: 109, end: 112 })
    expect(dragSpan(109, 109)).toEqual({ start: 109, end: 110 })
  })
})

describe("overlaps", () => {
  it("matches the API's half-open rule", () => {
    expect(overlaps({ start: 9, end: 11 }, { start: 11, end: 12 })).toBe(false)
    expect(overlaps({ start: 9, end: 11 }, { start: 10, end: 12 })).toBe(true)
  })
})

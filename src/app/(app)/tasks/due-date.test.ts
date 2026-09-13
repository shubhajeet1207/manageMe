import { afterAll, describe, expect, it } from "vitest"
import {
  DUE_BUCKET_ORDER,
  bucketFor,
  formatDueDate,
  localCalendarDate,
  localCalendarDateKey,
  toDateInputValue,
} from "./due-date"

const originalTz = process.env.TZ

/** A due date is a DAY. Every assertion below has to hold identically for a
 *  reader west of Greenwich and one east of it, because a UTC-midnight Date
 *  read through a local getter prints the previous day for the first one. */
function inZone<T>(timeZone: string, run: () => T): T {
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    process.env.TZ = originalTz
  }
}

const ZONES = ["America/Los_Angeles", "Asia/Kolkata", "UTC"]

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe("toDateInputValue", () => {
  it("round-trips the day the user typed in every timezone", () => {
    for (const zone of ZONES) {
      const value = inZone(zone, () => toDateInputValue(new Date("2026-09-14T00:00:00.000Z")))
      expect(value, zone).toBe("2026-09-14")
    }
  })

  it("is an empty string for no due date", () => {
    expect(toDateInputValue(null)).toBe("")
    expect(toDateInputValue(undefined)).toBe("")
  })

  it("pads single-digit months and days", () => {
    expect(toDateInputValue(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05")
  })
})

describe("formatDueDate", () => {
  it("prints the same day in every timezone", () => {
    for (const zone of ZONES) {
      const formatted = inZone(zone, () => formatDueDate(new Date("2026-09-14T00:00:00.000Z")))
      expect(formatted, zone).toBe("14 Sep 2026")
    }
  })

  it("prints 1 January as 1 January and not as 31 December", () => {
    for (const zone of ZONES) {
      const formatted = inZone(zone, () => formatDueDate(new Date("2026-01-01T00:00:00.000Z")))
      expect(formatted, zone).toBe("1 Jan 2026")
    }
  })
})

describe("localCalendarDate", () => {
  it("reads the reader's own calendar day, not UTC's", () => {
    // 2026-09-14T02:00Z is still 13 September in Los Angeles and already
    // 14 September in Kolkata, and each reader's list should say so.
    const instant = new Date("2026-09-14T02:00:00.000Z")

    expect(inZone("America/Los_Angeles", () => localCalendarDate(instant).toISOString())).toBe(
      "2026-09-13T00:00:00.000Z"
    )
    expect(inZone("Asia/Kolkata", () => localCalendarDate(instant).toISOString())).toBe(
      "2026-09-14T00:00:00.000Z"
    )
  })
})

describe("localCalendarDateKey", () => {
  it("is a stable string, so useSyncExternalStore does not re-render forever", () => {
    const instant = new Date("2026-09-14T02:00:00.000Z")
    expect(inZone("Asia/Kolkata", () => localCalendarDateKey(instant))).toBe("2026-09-14")
    expect(inZone("America/Los_Angeles", () => localCalendarDateKey(instant))).toBe("2026-09-13")
    expect(localCalendarDateKey(instant)).toBe(localCalendarDateKey(instant))
  })
})

describe("bucketFor", () => {
  const today = new Date("2026-09-14T00:00:00.000Z")

  it("puts yesterday in Overdue", () => {
    expect(bucketFor(new Date("2026-09-13T00:00:00.000Z"), today)).toBe("OVERDUE")
  })

  it("puts today in Due today", () => {
    expect(bucketFor(new Date("2026-09-14T00:00:00.000Z"), today)).toBe("TODAY")
  })

  it("puts the next six days in This week and the seventh in Later", () => {
    expect(bucketFor(new Date("2026-09-15T00:00:00.000Z"), today)).toBe("WEEK")
    expect(bucketFor(new Date("2026-09-20T00:00:00.000Z"), today)).toBe("WEEK")
    expect(bucketFor(new Date("2026-09-21T00:00:00.000Z"), today)).toBe("LATER")
  })

  it("puts no due date last", () => {
    expect(bucketFor(null, today)).toBe("NONE")
    expect(DUE_BUCKET_ORDER[DUE_BUCKET_ORDER.length - 1]).toBe("NONE")
  })

  it("buckets a date identically in every timezone", () => {
    for (const zone of ZONES) {
      expect(inZone(zone, () => bucketFor(new Date("2026-09-13T00:00:00.000Z"), today)), zone).toBe(
        "OVERDUE"
      )
    }
  })

  it("orders the buckets the way an ascending due-date sort already does", () => {
    expect(DUE_BUCKET_ORDER).toEqual(["OVERDUE", "TODAY", "WEEK", "LATER", "NONE"])
  })
})

import { describe, expect, it } from "vitest"
import { EXPIRY_WARNING_DAYS, expiryState, formatDate, formatFileSize } from "./format"

const now = new Date("2026-09-13T10:30:00.000Z")

describe("expiryState", () => {
  it("is null when there is no expiry", () => {
    expect(expiryState(null, now)).toBeNull()
  })

  it("is null further out than the warning window, so a 2035 passport is not a badge", () => {
    expect(expiryState(new Date("2026-10-14T00:00:00.000Z"), now)).toBeNull()
    expect(expiryState(new Date("2035-01-01T00:00:00.000Z"), now)).toBeNull()
  })

  it("warns on the last day of the window", () => {
    expect(expiryState(new Date("2026-10-13T00:00:00.000Z"), now)).toEqual({
      tone: "warning",
      label: `Expires in ${EXPIRY_WARNING_DAYS} days`,
    })
  })

  it("counts whole days, ignoring the time of day on either side", () => {
    expect(expiryState(new Date("2026-09-30T23:59:00.000Z"), now)).toEqual({
      tone: "warning",
      label: "Expires in 17 days",
    })
  })

  it("says tomorrow rather than in 1 days", () => {
    expect(expiryState(new Date("2026-09-14T00:00:00.000Z"), now)).toEqual({
      tone: "warning",
      label: "Expires tomorrow",
    })
  })

  it("says today for an expiry later the same day", () => {
    expect(expiryState(new Date("2026-09-13T23:00:00.000Z"), now)).toEqual({
      tone: "warning",
      label: "Expires today",
    })
  })

  it("reads a past expiry as expired, however long ago", () => {
    expect(expiryState(new Date("2026-09-12T23:00:00.000Z"), now)).toEqual({
      tone: "expired",
      label: "Expired",
    })
    expect(expiryState(new Date("2019-01-01T00:00:00.000Z"), now)).toEqual({
      tone: "expired",
      label: "Expired",
    })
  })
})

describe("re-exports", () => {
  it("shares the resume library's date and size formatting rather than restating it", () => {
    expect(formatDate(new Date("2026-09-13T10:30:00.000Z"))).toBe("2026-09-13")
    expect(formatFileSize(2048)).toBe("2 KB")
  })
})

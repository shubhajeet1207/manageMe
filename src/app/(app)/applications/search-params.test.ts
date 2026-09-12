import { describe, expect, it } from "vitest"
import { STATUS_ORDER } from "@/components/status-badge"
import { parseStatus, parseView } from "./search-params"

describe("parseStatus", () => {
  it.each(STATUS_ORDER)("accepts %s and returns it unchanged", (status) => {
    expect(parseStatus(status)).toBe(status)
  })

  // `value in ApplicationStatus` walks the prototype chain, so these
  // inherited names must be rejected rather than returned as statuses.
  it.each(["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"])(
    "rejects the inherited property name %s",
    (value) => {
      expect(parseStatus(value)).toBeNull()
    }
  )

  it("rejects undefined", () => {
    expect(parseStatus(undefined)).toBeNull()
  })

  it("rejects an empty string", () => {
    expect(parseStatus("")).toBeNull()
  })

  it("rejects arbitrary garbage", () => {
    expect(parseStatus("not-a-status")).toBeNull()
  })

  it("rejects lowercase input, since the enum values are uppercase", () => {
    expect(parseStatus("offer")).toBeNull()
  })
})

describe("parseView", () => {
  it('returns "table" for "table"', () => {
    expect(parseView("table")).toBe("table")
  })

  it('returns "board" for undefined', () => {
    expect(parseView(undefined)).toBe("board")
  })

  it('returns "board" for anything else', () => {
    expect(parseView("board")).toBe("board")
    expect(parseView("garbage")).toBe("board")
  })
})

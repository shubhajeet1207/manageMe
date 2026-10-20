import { describe, expect, it } from "vitest"
import { checkQuota, effectivePlan, planLimits, QuotaExceededError } from "./plans"

describe("effectivePlan", () => {
  const now = new Date("2026-10-17T12:00:00.000Z")

  it("grants Pro only while a paid state has a future period end", () => {
    expect(
      effectivePlan(
        { plan: "PRO", status: "active", currentPeriodEnd: new Date("2026-11-17T12:00:00.000Z") },
        now
      )
    ).toBe("PRO")
    expect(
      effectivePlan(
        { plan: "PRO", status: "trialing", currentPeriodEnd: new Date("2026-11-17T12:00:00.000Z") },
        now
      )
    ).toBe("PRO")
  })

  it.each([
    null,
    { plan: "FREE" as const, status: "active", currentPeriodEnd: new Date("2026-11-17T12:00:00.000Z") },
    { plan: "PRO" as const, status: "past_due", currentPeriodEnd: new Date("2026-11-17T12:00:00.000Z") },
    { plan: "PRO" as const, status: "active", currentPeriodEnd: new Date("2026-10-17T11:59:59.000Z") },
    { plan: "PRO" as const, status: "active", currentPeriodEnd: null },
  ])("falls back to Free for an ineligible account", (account) => {
    expect(effectivePlan(account, now)).toBe("FREE")
  })
})

describe("planLimits", () => {
  it("uses the product defaults when no overrides are present", () => {
    expect(planLimits("FREE", {})).toEqual({
      applications: 50,
      contacts: 25,
      reminders: 20,
      storageBytes: 104_857_600,
    })
  })

  it("accepts a non-negative integer override", () => {
    expect(planLimits("FREE", { FREE_APPLICATIONS: "75" }).applications).toBe(75)
  })

  it.each(["-1", "1.5", "many", String(Number.MAX_SAFE_INTEGER + 1)])(
    "rejects the invalid override %j",
    (value) => {
      expect(() => planLimits("FREE", { FREE_APPLICATIONS: value })).toThrow(
        "Invalid FREE quota configuration"
      )
    }
  )
})

describe("checkQuota", () => {
  it("allows a write that lands exactly on the limit", () => {
    expect(() => checkQuota("applications", 49, 1, 50)).not.toThrow()
  })

  it("throws a typed error when the write crosses the limit", () => {
    expect(() => checkQuota("applications", 50, 1, 50)).toThrow(QuotaExceededError)
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects the invalid increment %s", (increment) => {
    expect(() => checkQuota("applications", 0, increment, 50)).toThrow(
      "Quota increment must be a non-negative integer"
    )
  })
})

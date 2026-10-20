import { afterEach, describe, expect, it, vi } from "vitest"
import { eventRetentionDays, sanitizeEvent } from "./events"

afterEach(() => vi.unstubAllEnvs())

describe("sanitizeEvent", () => {
  it("keeps only a declared, low-cardinality payload", () => {
    expect(sanitizeEvent("application_created", { source: "csv" })).toEqual({ source: "csv" })
  })

  it("rejects arbitrary text and unknown properties", () => {
    expect(() =>
      sanitizeEvent("application_created", { source: "manual", companyName: "Sensitive Corp" })
    ).toThrow()
    expect(() => sanitizeEvent("feature_used", { feature: "secret-feature" })).toThrow()
  })

  it("does not permit payloads on empty events", () => {
    expect(() => sanitizeEvent("signup_completed", { email: "person@example.com" })).toThrow()
  })
})

describe("eventRetentionDays", () => {
  it("defaults to ninety days", () => {
    vi.stubEnv("PRODUCT_EVENT_RETENTION_DAYS", "")
    expect(eventRetentionDays()).toBe(90)
  })

  it.each(["0", "366", "1.5", "forever"])("rejects %j", (value) => {
    vi.stubEnv("PRODUCT_EVENT_RETENTION_DAYS", value)
    expect(() => eventRetentionDays()).toThrow(
      "PRODUCT_EVENT_RETENTION_DAYS must be between 1 and 365"
    )
  })
})

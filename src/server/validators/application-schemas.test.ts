import { describe, expect, it } from "vitest"
import {
  createApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
  type CreateApplicationInput,
} from "./application-schemas"

const base = { companyId: "c1", roleTitle: "Engineer", status: "APPLIED" }

describe("createApplicationSchema", () => {
  it("accepts a minimal application", () => {
    expect(createApplicationSchema.safeParse(base).success).toBe(true)
  })

  it("rejects a missing company", () => {
    const result = createApplicationSchema.safeParse({ ...base, companyId: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.companyId?.[0]).toBe("Company is required")
  })

  it("rejects an empty role title", () => {
    const result = createApplicationSchema.safeParse({ ...base, roleTitle: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.roleTitle?.[0]).toBe("Role title is required")
  })

  it("rejects an unknown status", () => {
    expect(createApplicationSchema.safeParse({ ...base, status: "PENDING" }).success).toBe(false)
  })

  it("accepts every valid status", () => {
    for (const status of [
      "SAVED",
      "APPLIED",
      "SCREENING",
      "INTERVIEW",
      "OFFER",
      "ACCEPTED",
      "REJECTED",
    ]) {
      expect(createApplicationSchema.safeParse({ ...base, status }).success).toBe(true)
    }
  })

  it("defaults status to SAVED when omitted", () => {
    const result = createApplicationSchema.safeParse({ companyId: "c1", roleTitle: "Engineer" })
    expect(result.success && result.data.status).toBe("SAVED")
  })

  it("rejects a malformed job URL", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "not-a-url" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.jobUrl?.[0]).toBe("Enter a valid URL")
  })

  it("normalises an empty job URL to undefined", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "" })
    expect(result.success && result.data.jobUrl).toBeUndefined()
  })

  it("rejects a javascript: job URL", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "javascript:alert(1)" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.jobUrl?.[0]).toBe("Enter a valid URL")
  })

  it("accepts a valid job URL", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "https://jobs.example.com/1" })
    expect(result.success).toBe(true)
  })

  it("coerces salary strings to integers", () => {
    const result = createApplicationSchema.safeParse({ ...base, salaryMin: "1000", salaryMax: "2000" })
    expect(result.success && result.data.salaryMin).toBe(1000)
    expect(result.success && result.data.salaryMax).toBe(2000)
  })

  it("normalises empty salary strings to undefined", () => {
    const result = createApplicationSchema.safeParse({ ...base, salaryMin: "", salaryMax: "" })
    expect(result.success && result.data.salaryMin).toBeUndefined()
    expect(result.success && result.data.salaryMax).toBeUndefined()
  })

  it("rejects a negative salary", () => {
    expect(createApplicationSchema.safeParse({ ...base, salaryMin: -1 }).success).toBe(false)
  })

  it("rejects salaryMax below salaryMin, reporting on salaryMax", () => {
    const result = createApplicationSchema.safeParse({ ...base, salaryMin: 2000, salaryMax: 1000 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.salaryMax?.[0]).toBe(
      "Maximum salary must be greater than or equal to minimum"
    )
  })

  it("accepts equal salaries", () => {
    expect(
      createApplicationSchema.safeParse({ ...base, salaryMin: 1000, salaryMax: 1000 }).success
    ).toBe(true)
  })

  it("accepts a salary maximum with no minimum", () => {
    expect(createApplicationSchema.safeParse({ ...base, salaryMax: 1000 }).success).toBe(true)
  })

  it("rejects a future applied date", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = createApplicationSchema.safeParse({ ...base, appliedAt: tomorrow })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.appliedAt?.[0]).toBe(
      "Applied date cannot be in the future"
    )
  })

  it("accepts a past applied date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(createApplicationSchema.safeParse({ ...base, appliedAt: yesterday }).success).toBe(true)
  })

  it("normalises an empty applied date to undefined", () => {
    const result = createApplicationSchema.safeParse({ ...base, appliedAt: "" })
    expect(result.success && result.data.appliedAt).toBeUndefined()
  })

  it("keeps a resume version id", () => {
    const result = createApplicationSchema.safeParse({ ...base, resumeVersionId: "rv1" })
    expect(result.success && result.data.resumeVersionId).toBe("rv1")
  })

  it("normalises the None option to undefined rather than an empty string", () => {
    // The select submits "" for None; an empty string would fail the foreign
    // key instead of clearing the link.
    const result = createApplicationSchema.safeParse({ ...base, resumeVersionId: "" })
    expect(result.success && result.data.resumeVersionId).toBeUndefined()
  })

  it("accepts an application with no resume linked", () => {
    const result = createApplicationSchema.safeParse(base)
    expect(result.success && "resumeVersionId" in result.data).toBe(false)
  })

  it("infers resumeVersionId as an OPTIONAL key, not a required one that may be undefined", () => {
    // The Zod-4 footgun: `.transform()` after `.optional()` hides the optional
    // marker from key inference. This assignment does not compile if
    // `resumeVersionId` infers as required, so `tsc` is the assertion.
    const input: CreateApplicationInput = { companyId: "c1", roleTitle: "Engineer", status: "SAVED" }
    expect(input.resumeVersionId).toBeUndefined()
  })
})

describe("updateApplicationSchema", () => {
  it("requires an id", () => {
    expect(updateApplicationSchema.safeParse(base).success).toBe(false)
  })

  it("accepts an id with the base fields", () => {
    expect(updateApplicationSchema.safeParse({ ...base, id: "a1" }).success).toBe(true)
  })
})

describe("updateStatusSchema", () => {
  it("accepts an id and a valid status", () => {
    expect(updateStatusSchema.safeParse({ id: "a1", status: "INTERVIEW" }).success).toBe(true)
  })

  it("rejects an unknown status", () => {
    expect(updateStatusSchema.safeParse({ id: "a1", status: "NOPE" }).success).toBe(false)
  })
})

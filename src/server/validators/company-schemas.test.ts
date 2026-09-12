import { describe, expect, it } from "vitest"
import { createCompanySchema, updateCompanySchema } from "./company-schemas"

describe("createCompanySchema", () => {
  it("accepts a company with only a name", () => {
    const result = createCompanySchema.safeParse({ name: "Acme" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty name", () => {
    const result = createCompanySchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.name?.[0]).toBe("Name is required")
  })

  it("trims whitespace from the name", () => {
    const result = createCompanySchema.safeParse({ name: "  Acme  " })
    expect(result.success && result.data.name).toBe("Acme")
  })

  it("rejects a name longer than 200 characters", () => {
    const result = createCompanySchema.safeParse({ name: "a".repeat(201) })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed website", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "not-a-url" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.website?.[0]).toBe("Enter a valid URL")
  })

  it("accepts a valid website", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "https://acme.com" })
    expect(result.success).toBe(true)
  })

  it("rejects a javascript: URL", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "javascript:alert(1)" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.website?.[0]).toBe("Enter a valid URL")
  })

  it("normalises an empty website to undefined", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "" })
    expect(result.success && result.data.website).toBeUndefined()
  })

  it("normalises empty location and notes to undefined", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", location: "", notes: "" })
    expect(result.success && result.data.location).toBeUndefined()
    expect(result.success && result.data.notes).toBeUndefined()
  })
})

describe("updateCompanySchema", () => {
  it("requires an id", () => {
    const result = updateCompanySchema.safeParse({ name: "Acme" })
    expect(result.success).toBe(false)
  })

  it("accepts an id with a name", () => {
    const result = updateCompanySchema.safeParse({ id: "c1", name: "Acme" })
    expect(result.success).toBe(true)
  })
})

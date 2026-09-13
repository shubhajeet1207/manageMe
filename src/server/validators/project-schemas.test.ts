import { describe, expect, it } from "vitest"
import { createProjectSchema, updateProjectSchema } from "./project-schemas"

describe("createProjectSchema", () => {
  it("accepts a name alone and defaults the status to ACTIVE", () => {
    const parsed = createProjectSchema.parse({ name: "Portfolio site" })
    expect(parsed).toMatchObject({ name: "Portfolio site", status: "ACTIVE" })
    expect(parsed.description).toBeUndefined()
    expect(parsed.url).toBeUndefined()
  })

  it("rejects a blank name", () => {
    const result = createProjectSchema.safeParse({ name: "   " })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name?.[0]).toBe("Name is required")
    }
  })

  it("rejects a name past 200 characters", () => {
    expect(createProjectSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false)
  })

  it("rejects an unknown status", () => {
    expect(createProjectSchema.safeParse({ name: "x", status: "SHIPPED" }).success).toBe(false)
  })

  it("accepts IDEA, which is where a triaged QuickDrop item lands", () => {
    expect(createProjectSchema.parse({ name: "x", status: "IDEA" }).status).toBe("IDEA")
  })

  it("rejects a javascript: url", () => {
    const result = createProjectSchema.safeParse({ name: "x", url: "javascript:alert(1)" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.url?.[0]).toBe("Enter a valid URL")
    }
  })

  it("turns an empty url and an empty description into undefined", () => {
    const parsed = createProjectSchema.parse({ name: "x", url: "", description: "" })
    expect(parsed.url).toBeUndefined()
    expect(parsed.description).toBeUndefined()
  })

  it("keeps every optional key optional", () => {
    // The Zod 4 regression: transform-after-optional turns these into required
    // keys typed `T | undefined`, and this object stops typechecking.
    const input: Parameters<typeof createProjectSchema.parse>[0] = { name: "x" }
    expect(createProjectSchema.parse(input).name).toBe("x")
  })
})

describe("updateProjectSchema", () => {
  it("requires an id", () => {
    expect(updateProjectSchema.safeParse({ name: "x" }).success).toBe(false)
    expect(updateProjectSchema.safeParse({ id: "p1", name: "x" }).success).toBe(true)
  })
})

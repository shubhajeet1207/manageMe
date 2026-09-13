import { describe, expect, it } from "vitest"
import {
  MAX_SECRET_LENGTH,
  createCredentialSchema,
  credentialIdSchema,
  revealCredentialSchema,
  updateCredentialSchema,
} from "./credential-schemas"

describe("createCredentialSchema", () => {
  it("accepts a label and a secret", () => {
    const parsed = createCredentialSchema.parse({ label: "Workday — Acme", secret: "hunter2" })
    expect(parsed.label).toBe("Workday — Acme")
    expect(parsed.secret).toBe("hunter2")
    expect(parsed.siteUrl).toBeUndefined()
    expect(parsed.username).toBeUndefined()
    expect(parsed.notes).toBeUndefined()
  })

  it("requires a label", () => {
    const result = createCredentialSchema.safeParse({ label: "  ", secret: "hunter2" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.label?.[0]).toBe("Label is required")
    }
  })

  it("requires a secret on create", () => {
    const result = createCredentialSchema.safeParse({ label: "x" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.secret?.[0]).toBe("Password is required")
    }
  })

  it("rejects an empty secret on create", () => {
    expect(createCredentialSchema.safeParse({ label: "x", secret: "" }).success).toBe(false)
  })

  it("never trims the secret — whitespace can be part of a password", () => {
    const parsed = createCredentialSchema.parse({ label: "x", secret: "  spaced  " })
    expect(parsed.secret).toBe("  spaced  ")
  })

  it("accepts a secret at the cap and rejects one past it", () => {
    expect(
      createCredentialSchema.parse({ label: "x", secret: "s".repeat(MAX_SECRET_LENGTH) }).secret
    ).toHaveLength(MAX_SECRET_LENGTH)
    expect(
      createCredentialSchema.safeParse({ label: "x", secret: "s".repeat(MAX_SECRET_LENGTH + 1) })
        .success
    ).toBe(false)
  })

  it("rejects a javascript: site url", () => {
    expect(
      createCredentialSchema.safeParse({
        label: "x",
        secret: "s",
        siteUrl: "javascript:alert(1)",
      }).success
    ).toBe(false)
  })

  it("never carries the secret in an error message", () => {
    const secret = "a-very-recognisable-password"
    const result = createCredentialSchema.safeParse({ label: "", secret })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).not.toContain(secret)
    }
  })
})

describe("updateCredentialSchema", () => {
  it("requires an id", () => {
    expect(updateCredentialSchema.safeParse({ label: "x" }).success).toBe(false)
  })

  it("treats an absent secret as leave-the-stored-password-alone", () => {
    const parsed = updateCredentialSchema.parse({ id: "c1", label: "x" })
    expect(parsed.secret).toBeUndefined()
  })

  it("treats an empty secret as leave-the-stored-password-alone", () => {
    const parsed = updateCredentialSchema.parse({ id: "c1", label: "x", secret: "" })
    expect(parsed.secret).toBeUndefined()
  })

  it("keeps the secret key optional rather than required-and-undefined", () => {
    const input: Parameters<typeof updateCredentialSchema.parse>[0] = { id: "c1", label: "x" }
    expect(updateCredentialSchema.parse(input).label).toBe("x")
  })

  it("passes a supplied secret through untrimmed", () => {
    expect(updateCredentialSchema.parse({ id: "c1", label: "x", secret: " p " }).secret).toBe(" p ")
  })

  it("still caps a supplied secret", () => {
    expect(
      updateCredentialSchema.safeParse({
        id: "c1",
        label: "x",
        secret: "s".repeat(MAX_SECRET_LENGTH + 1),
      }).success
    ).toBe(false)
  })
})

describe("revealCredentialSchema", () => {
  it("takes an id and the account password", () => {
    expect(revealCredentialSchema.parse({ id: "c1", password: "pw" })).toEqual({
      id: "c1",
      password: "pw",
    })
  })

  it("never trims the account password", () => {
    expect(revealCredentialSchema.parse({ id: "c1", password: "  pw  " }).password).toBe("  pw  ")
  })

  it("rejects an empty password", () => {
    const result = revealCredentialSchema.safeParse({ id: "c1", password: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password?.[0]).toBe(
        "Enter your account password"
      )
    }
  })

  it("never carries the password in an error message", () => {
    const password = "another-recognisable-password"
    const result = revealCredentialSchema.safeParse({ id: "", password })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).not.toContain(password)
    }
  })
})

describe("credentialIdSchema", () => {
  it("requires an id", () => {
    expect(credentialIdSchema.safeParse({}).success).toBe(false)
    expect(credentialIdSchema.parse({ id: "c1" })).toEqual({ id: "c1" })
  })
})

import { describe, expect, it } from "vitest"
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
  updateProfileSchema,
} from "./auth-schemas"

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Password123",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a password without a digit", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Passwordonly",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Pw1",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "Password123",
    })
    expect(result.success).toBe(false)
  })
})

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "anything",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})

describe("updateProfileSchema", () => {
  it("accepts a non-empty name", () => {
    expect(updateProfileSchema.safeParse({ name: "Ada" }).success).toBe(true)
  })

  it("rejects an empty name", () => {
    expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassword1",
      newPassword: "NewPassword1",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a weak new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassword1",
      newPassword: "weak",
    })
    expect(result.success).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "./password"

describe("password", () => {
  it("verifies a correct password against its hash", async () => {
    const hashed = await hashPassword("Password123")
    await expect(verifyPassword("Password123", hashed)).resolves.toBe(true)
  })

  it("rejects an incorrect password", async () => {
    const hashed = await hashPassword("Password123")
    await expect(verifyPassword("WrongPassword1", hashed)).resolves.toBe(false)
  })

  it("produces a hash that is not the plaintext", async () => {
    const hashed = await hashPassword("Password123")
    expect(hashed).not.toBe("Password123")
  })
})

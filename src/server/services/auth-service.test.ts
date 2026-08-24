import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  EmailAlreadyExistsError,
  InvalidCurrentPasswordError,
  changePassword,
  createUser,
  updateProfile,
  verifyCredentials,
} from "./auth-service"

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } })
    createdIds.length = 0
  }
})

describe("createUser", () => {
  it("creates a user with a hashed password", async () => {
    const email = `svc-test-${Date.now()}@example.com`
    const user = await createUser({ name: "Svc Test", email, password: "Password123" })
    createdIds.push(user.id)

    expect(user.hashedPassword).not.toBe("Password123")
  })

  it("rejects a duplicate email", async () => {
    const email = `svc-test-${Date.now()}-dup@example.com`
    const first = await createUser({ name: "First", email, password: "Password123" })
    createdIds.push(first.id)

    await expect(
      createUser({ name: "Second", email, password: "Password123" })
    ).rejects.toBeInstanceOf(EmailAlreadyExistsError)
  })
})

describe("verifyCredentials", () => {
  it("returns the user for correct credentials", async () => {
    const email = `svc-test-${Date.now()}-verify@example.com`
    const created = await createUser({ name: "Verify", email, password: "Password123" })
    createdIds.push(created.id)

    const result = await verifyCredentials(email, "Password123")
    expect(result?.id).toBe(created.id)
  })

  it("returns null for an incorrect password", async () => {
    const email = `svc-test-${Date.now()}-wrongpw@example.com`
    const created = await createUser({ name: "WrongPw", email, password: "Password123" })
    createdIds.push(created.id)

    const result = await verifyCredentials(email, "WrongPassword1")
    expect(result).toBeNull()
  })

  it("returns null for an unknown email", async () => {
    const result = await verifyCredentials("nobody@example.com", "Password123")
    expect(result).toBeNull()
  })
})

describe("updateProfile", () => {
  it("updates the user's name", async () => {
    const email = `svc-test-${Date.now()}-profile@example.com`
    const created = await createUser({ name: "Before", email, password: "Password123" })
    createdIds.push(created.id)

    const updated = await updateProfile(created.id, "After")
    expect(updated.name).toBe("After")
  })
})

describe("changePassword", () => {
  it("changes the password when the current password is correct", async () => {
    const email = `svc-test-${Date.now()}-changepw@example.com`
    const created = await createUser({ name: "ChangePw", email, password: "Password123" })
    createdIds.push(created.id)

    await changePassword(created.id, "Password123", "NewPassword1")
    const result = await verifyCredentials(email, "NewPassword1")
    expect(result?.id).toBe(created.id)
  })

  it("rejects an incorrect current password", async () => {
    const email = `svc-test-${Date.now()}-badcurrent@example.com`
    const created = await createUser({ name: "BadCurrent", email, password: "Password123" })
    createdIds.push(created.id)

    await expect(
      changePassword(created.id, "WrongCurrent1", "NewPassword1")
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError)
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as userRepository from "./user-repository"

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } })
    createdIds.length = 0
  }
})

describe("userRepository", () => {
  it("creates a user and finds it by email", async () => {
    const email = `repo-test-${Date.now()}@example.com`
    const user = await userRepository.create({
      name: "Repo Test",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const found = await userRepository.findByEmail(email)
    expect(found?.id).toBe(user.id)
  })

  it("returns null for an unknown email", async () => {
    const found = await userRepository.findByEmail("no-such-user@example.com")
    expect(found).toBeNull()
  })

  it("finds a user by id", async () => {
    const email = `repo-test-${Date.now()}-2@example.com`
    const user = await userRepository.create({
      name: "Repo Test 2",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const found = await userRepository.findById(user.id)
    expect(found?.email).toBe(email)
  })

  it("updates a user's name", async () => {
    const email = `repo-test-${Date.now()}-3@example.com`
    const user = await userRepository.create({
      name: "Old Name",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const updated = await userRepository.updateName(user.id, "New Name")
    expect(updated.name).toBe("New Name")
  })

  it("updates a user's password hash", async () => {
    const email = `repo-test-${Date.now()}-4@example.com`
    const user = await userRepository.create({
      name: "Repo Test 4",
      email,
      hashedPassword: "old-hash",
    })
    createdIds.push(user.id)

    const updated = await userRepository.updatePassword(user.id, "new-hash")
    expect(updated.hashedPassword).toBe("new-hash")
  })
})

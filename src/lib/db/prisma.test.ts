import { afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "./prisma"

/**
 * The exported `prisma` is a lazy Proxy, not the client. These tests pin the two
 * ways it has to behave like the client beyond plain property reads, because a
 * test that injects a database failure depends on both — the §8.5 rollback test
 * in resume-service.test.ts spies on `$transaction` exactly like this, and it
 * failed in CI from the day the facade went lazy until this was fixed.
 *
 * Nothing here reaches the database: constructing the client only needs
 * DATABASE_URL to be set, and every call below is answered by a spy.
 */
describe("prisma facade", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports the client's members as present", () => {
    expect("$transaction" in prisma).toBe(true)
    expect("user" in prisma).toBe(true)
    expect("notAMember" in prisma).toBe(false)
  })

  it("routes calls to a spy installed through it", async () => {
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("injected"))

    await expect(prisma.$transaction([])).rejects.toThrow("injected")
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("hands calls back to the client once the spy is restored", () => {
    vi.spyOn(prisma, "$transaction")
    vi.restoreAllMocks()

    expect(vi.isMockFunction(prisma.$transaction)).toBe(false)
  })
})

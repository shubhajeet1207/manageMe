import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as companyRepository from "./company-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Company Repo Test",
      email: `company-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("companyRepository", () => {
  it("creates a company and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await companyRepository.create(user.id, { name: "Acme" })

    const list = await companyRepository.listByUser(user.id)
    expect(list.map((c) => c.id)).toContain(created.id)
  })

  it("includes an application count in the list", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    const list = await companyRepository.listByUser(user.id)
    expect(list.find((c) => c.id === company.id)?._count.applications).toBe(1)
  })

  it("finds a company by id for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    const found = await companyRepository.findById(user.id, company.id)
    expect(found?.name).toBe("Acme")
  })

  it("finds a company by name for its owner", async () => {
    const user = await makeUser()
    await companyRepository.create(user.id, { name: "Acme" })

    const found = await companyRepository.findByName(user.id, "Acme")
    expect(found?.name).toBe("Acme")
  })

  it("updates a company for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    const updated = await companyRepository.update(user.id, company.id, {
      name: "Acme Corp",
      location: "Bengaluru",
    })
    expect(updated?.name).toBe("Acme Corp")
    expect(updated?.location).toBe("Bengaluru")
  })

  it("deletes a company for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    expect(await companyRepository.remove(user.id, company.id)).toBe(true)
    expect(await companyRepository.findById(user.id, company.id)).toBeNull()
  })

  it("counts a company's applications", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    expect(await companyRepository.countApplications(user.id, company.id)).toBe(1)
  })

  describe("ownership", () => {
    it("does not list another user's companies", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.listByUser(other.id)).toHaveLength(0)
    })

    it("does not find another user's company by id", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.findById(other.id, company.id)).toBeNull()
    })

    it("does not update another user's company", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.update(other.id, company.id, { name: "Hacked" })).toBeNull()
      expect((await companyRepository.findById(owner.id, company.id))?.name).toBe("Acme")
    })

    it("does not delete another user's company", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.remove(other.id, company.id)).toBe(false)
      expect(await companyRepository.findById(owner.id, company.id)).not.toBeNull()
    })
  })
})

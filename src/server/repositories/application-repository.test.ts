import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "./application-repository"

const createdUserIds: string[] = []

async function makeUserWithCompany() {
  const user = await prisma.user.create({
    data: {
      name: "App Repo Test",
      email: `app-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("applicationRepository", () => {
  it("creates an application and lists it with its company", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByUser(user.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
    expect(list[0].company.name).toBe("Acme")
  })

  it("defaults status to SAVED", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "SAVED",
    })
    expect(created.status).toBe("SAVED")
  })

  it("lists applications for one company", async () => {
    const { user, company } = await makeUserWithCompany()
    const other = await prisma.company.create({ data: { userId: user.id, name: "Globex" } })
    await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    await applicationRepository.create(user.id, {
      companyId: other.id,
      roleTitle: "Designer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByCompany(user.id, company.id)
    expect(list).toHaveLength(1)
    expect(list[0].roleTitle).toBe("Engineer")
  })

  it("finds an application by id", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const found = await applicationRepository.findById(user.id, created.id)
    expect(found?.roleTitle).toBe("Engineer")
  })

  it("updates an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.update(user.id, created.id, {
      companyId: company.id,
      roleTitle: "Senior Engineer",
      status: "INTERVIEW",
    })
    expect(updated?.roleTitle).toBe("Senior Engineer")
    expect(updated?.status).toBe("INTERVIEW")
  })

  it("updates only the status", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.updateStatus(user.id, created.id, "OFFER")
    expect(updated?.status).toBe("OFFER")
    expect(updated?.roleTitle).toBe("Engineer")
  })

  it("deletes an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    expect(await applicationRepository.remove(user.id, created.id)).toBe(true)
    expect(await applicationRepository.findById(user.id, created.id)).toBeNull()
  })

  describe("ownership", () => {
    it("does not list another user's applications", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.listByUser(other.user.id)).toHaveLength(0)
    })

    it("does not find another user's application by id", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.findById(other.user.id, created.id)).toBeNull()
    })

    it("does not update another user's application status", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(
        await applicationRepository.updateStatus(other.user.id, created.id, "REJECTED")
      ).toBeNull()
      expect((await applicationRepository.findById(owner.user.id, created.id))?.status).toBe(
        "APPLIED"
      )
    })

    it("does not delete another user's application", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.remove(other.user.id, created.id)).toBe(false)
      expect(await applicationRepository.findById(owner.user.id, created.id)).not.toBeNull()
    })
  })
})

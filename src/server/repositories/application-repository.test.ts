import { randomUUID } from "node:crypto"
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

/** A resume version written directly: these tests are about the link field on
 *  the application, not about the upload path. */
async function makeResumeVersion(userId: string) {
  const resume = await prisma.resume.create({
    data: { userId, name: `Backend SWE ${randomUUID().slice(0, 8)}` },
  })
  return prisma.resumeVersion.create({
    data: {
      userId,
      resumeId: resume.id,
      label: "October",
      originalFilename: "resume.pdf",
      storageKey: `resumes/${userId}/${randomUUID()}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 1024,
    },
  })
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  // Applications Restrict on resumeVersion, so they go before the versions
  // they point at rather than relying on the order of a user cascade.
  await prisma.application.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { resumeVersion: { userId: { in: ids } } }] },
  })
  await prisma.resumeVersion.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
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

  // Prisma treats an `undefined` field as "leave unchanged", not "clear it".
  // These prove `update` maps a cleared optional field to `null` in the
  // write rather than dropping it from the `data` object.
  describe("clearing an optional field", () => {
    it("unlinks a resume version when resumeVersionId is cleared", async () => {
      const { user, company } = await makeUserWithCompany()
      const version = await makeResumeVersion(user.id)
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        resumeVersionId: version.id,
      })
      expect(created.resumeVersionId).toBe(version.id)

      const updated = await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(updated?.resumeVersionId).toBeNull()
      expect(reread?.resumeVersionId).toBeNull()
    })

    it("clears jobUrl when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        jobUrl: "https://example.com/job/123",
      })
      expect(created.jobUrl).toBe("https://example.com/job/123")

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.jobUrl).toBeNull()
    })

    it("clears notes when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        notes: "Referred by a friend",
      })
      expect(created.notes).toBe("Referred by a friend")

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.notes).toBeNull()
    })

    it("clears salaryMin when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        salaryMin: 90000,
      })
      expect(created.salaryMin).toBe(90000)

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.salaryMin).toBeNull()
    })
  })
})

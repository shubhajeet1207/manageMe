import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { ResumeVersionNotOwnedError } from "./resume-service"
import {
  ApplicationNotFoundError,
  CompanyNotOwnedError,
  changeStatus,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "./application-service"

const createdUserIds: string[] = []

async function makeUserWithCompany() {
  const user = await prisma.user.create({
    data: {
      name: "App Service Test",
      email: `app-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

/** A resume slot holding one version, written directly: these tests are about
 *  the link, not about the upload path. */
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
  // Applications Restrict on resumeVersion, so they go before the versions they
  // point at rather than relying on the order of a user cascade.
  await prisma.application.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { resumeVersion: { userId: { in: ids } } }] },
  })
  await prisma.resumeVersion.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("createApplication", () => {
  it("creates an application against the user's own company", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    expect(created.roleTitle).toBe("Engineer")
  })

  it("refuses to attach an application to another user's company", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()

    await expect(
      createApplication(other.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)
  })
})

describe("updateApplication", () => {
  it("updates an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await updateApplication(user.id, created.id, {
      companyId: company.id,
      roleTitle: "Staff Engineer",
      status: "INTERVIEW",
    })
    expect(updated.roleTitle).toBe("Staff Engineer")
  })

  it("refuses to move an application onto another user's company", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(other.user.id, {
      companyId: other.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(
      updateApplication(other.user.id, created.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)
  })

  it("throws ApplicationNotFoundError for another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(
      updateApplication(other.user.id, created.id, {
        companyId: other.company.id,
        roleTitle: "Hacked",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
  })
})

describe("changeStatus", () => {
  it("changes the status", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await changeStatus(user.id, created.id, "OFFER")
    expect(updated.status).toBe("OFFER")
  })

  it("throws ApplicationNotFoundError for another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(changeStatus(other.user.id, created.id, "REJECTED")).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })
})

describe("getApplication, listApplications and deleteApplication", () => {
  it("lists only the user's applications", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    expect(await listApplications(other.user.id)).toHaveLength(0)
  })

  it("throws ApplicationNotFoundError when getting another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(getApplication(other.user.id, created.id)).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })

  it("deletes the user's own application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(deleteApplication(user.id, created.id)).resolves.toBeUndefined()
  })

  it("throws ApplicationNotFoundError when deleting another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(deleteApplication(other.user.id, created.id)).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })
})

// The cross-entity hole `assertResumeVersionOwned` closes, and the reason
// repository scoping cannot: every write below targets the caller's OWN
// application row, so each `where: { userId }` matches and the foreign key is
// satisfied. Only the service guard stands between a user and another user's
// file. Mirrors the CompanyNotOwnedError battery above.
describe("resume version linking", () => {
  it("links an application to the caller's own resume version", async () => {
    const { user, company } = await makeUserWithCompany()
    const version = await makeResumeVersion(user.id)

    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
      resumeVersionId: version.id,
    })
    expect(created.resumeVersionId).toBe(version.id)
  })

  it("accepts an application with no resume linked", async () => {
    const { user, company } = await makeUserWithCompany()

    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    expect(created.resumeVersionId).toBeNull()
  })

  it("refuses to link a new application to another user's resume version", async () => {
    const owner = await makeUserWithCompany()
    const ownerVersion = await makeResumeVersion(owner.user.id)
    const other = await makeUserWithCompany()

    await expect(
      createApplication(other.user.id, {
        companyId: other.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        resumeVersionId: ownerVersion.id,
      })
    ).rejects.toBeInstanceOf(ResumeVersionNotOwnedError)

    expect(await prisma.application.count({ where: { userId: other.user.id } })).toBe(0)
  })

  it("refuses to move an existing application onto another user's resume version", async () => {
    const owner = await makeUserWithCompany()
    const ownerVersion = await makeResumeVersion(owner.user.id)
    const other = await makeUserWithCompany()
    const created = await createApplication(other.user.id, {
      companyId: other.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(
      updateApplication(other.user.id, created.id, {
        companyId: other.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        resumeVersionId: ownerVersion.id,
      })
    ).rejects.toBeInstanceOf(ResumeVersionNotOwnedError)

    const untouched = await prisma.application.findUnique({ where: { id: created.id } })
    expect(untouched?.resumeVersionId).toBeNull()
  })

  it("refuses a resume version id that does not exist, with the identical error", async () => {
    const owner = await makeUserWithCompany()
    const ownerVersion = await makeResumeVersion(owner.user.id)
    const other = await makeUserWithCompany()

    const payload = (resumeVersionId: string) => ({
      companyId: other.company.id,
      roleTitle: "Engineer",
      status: "APPLIED" as const,
      resumeVersionId,
    })
    const notYours = await createApplication(other.user.id, payload(ownerVersion.id)).catch((e) => e)
    const notThere = await createApplication(other.user.id, payload("does-not-exist")).catch((e) => e)

    expect(notYours.constructor).toBe(notThere.constructor)
    // The message must not confirm that the version exists.
    expect(notYours.message).toBe(notThere.message)
  })
})

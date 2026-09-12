import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
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

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
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

import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  CompanyHasApplicationsError,
  CompanyNameTakenError,
  CompanyNotFoundError,
  createCompany,
  deleteCompany,
  findOrCreateByName,
  getCompany,
  listCompanies,
  updateCompany,
} from "./company-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Company Service Test",
      email: `company-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("createCompany", () => {
  it("creates a company", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    expect(company.name).toBe("Acme")
  })

  it("rejects a duplicate name for the same user", async () => {
    const user = await makeUser()
    await createCompany(user.id, { name: "Acme" })
    await expect(createCompany(user.id, { name: "Acme" })).rejects.toBeInstanceOf(
      CompanyNameTakenError
    )
  })

  it("allows the same name for two different users", async () => {
    const a = await makeUser()
    const b = await makeUser()
    await createCompany(a.id, { name: "Acme" })
    await expect(createCompany(b.id, { name: "Acme" })).resolves.toBeDefined()
  })
})

describe("listCompanies and getCompany", () => {
  it("lists only the user's companies", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await createCompany(owner.id, { name: "Acme" })
    expect(await listCompanies(other.id)).toHaveLength(0)
  })

  it("throws CompanyNotFoundError for another user's company", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await createCompany(owner.id, { name: "Acme" })
    await expect(getCompany(other.id, company.id)).rejects.toBeInstanceOf(CompanyNotFoundError)
  })
})

describe("updateCompany", () => {
  it("updates a company", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    const updated = await updateCompany(user.id, company.id, { name: "Acme Corp" })
    expect(updated.name).toBe("Acme Corp")
  })

  it("rejects renaming onto another existing company's name", async () => {
    const user = await makeUser()
    await createCompany(user.id, { name: "Acme" })
    const other = await createCompany(user.id, { name: "Globex" })
    await expect(updateCompany(user.id, other.id, { name: "Acme" })).rejects.toBeInstanceOf(
      CompanyNameTakenError
    )
  })

  it("allows saving a company under its own unchanged name", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await expect(
      updateCompany(user.id, company.id, { name: "Acme", location: "Pune" })
    ).resolves.toBeDefined()
  })

  it("throws CompanyNotFoundError for another user's company", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await createCompany(owner.id, { name: "Acme" })
    await expect(updateCompany(other.id, company.id, { name: "Hacked" })).rejects.toBeInstanceOf(
      CompanyNotFoundError
    )
  })
})

describe("deleteCompany", () => {
  it("deletes a company with no applications", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await expect(deleteCompany(user.id, company.id)).resolves.toBeUndefined()
  })

  it("refuses to delete a company that has applications, reporting the count", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    await expect(deleteCompany(user.id, company.id)).rejects.toBeInstanceOf(
      CompanyHasApplicationsError
    )
    await expect(deleteCompany(user.id, company.id)).rejects.toMatchObject({ count: 1 })
  })
})

describe("findOrCreateByName", () => {
  it("returns the existing company when the name already exists", async () => {
    const user = await makeUser()
    const existing = await createCompany(user.id, { name: "Acme" })
    const found = await findOrCreateByName(user.id, "Acme")
    expect(found.id).toBe(existing.id)
  })

  it("creates the company when the name is new", async () => {
    const user = await makeUser()
    const created = await findOrCreateByName(user.id, "Globex")
    expect(created.name).toBe("Globex")
  })
})

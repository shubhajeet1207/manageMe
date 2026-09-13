import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as documentRepository from "./document-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Document Repo Test",
      email: `document-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

async function makeCompany(userId: string, name = `Acme ${randomUUID().slice(0, 8)}`) {
  return prisma.company.create({ data: { userId, name } })
}

function documentData(overrides: Partial<documentRepository.CreateDocumentData> = {}) {
  return {
    title: "Acme offer letter",
    tags: [],
    originalFilename: "offer.pdf",
    storageKey: `documents/seed/${randomUUID()}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 1024,
    ...overrides,
  }
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("create, findById and listByUser", () => {
  it("creates a document and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await documentRepository.create(user.id, documentData())

    const list = await documentRepository.listByUser(user.id, { query: "", tags: [] })
    expect(list.map((document) => document.id)).toContain(created.id)
  })

  it("stores tags, description, expiry and company", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const expiresOn = new Date("2030-06-01T00:00:00.000Z")
    const created = await documentRepository.create(
      user.id,
      documentData({
        description: "Signed copy",
        tags: ["offer letter", "Acme"],
        companyId: company.id,
        expiresOn,
      })
    )

    expect(created.description).toBe("Signed copy")
    expect(created.tags).toEqual(["offer letter", "Acme"])
    expect(created.companyId).toBe(company.id)
    expect(created.expiresOn?.toISOString()).toBe(expiresOn.toISOString())
  })

  it("includes the company on a read so the table can name it", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id, "Globex Ltd")
    const created = await documentRepository.create(
      user.id,
      documentData({ companyId: company.id })
    )

    const found = await documentRepository.findById(user.id, created.id)
    expect(found?.company?.name).toBe("Globex Ltd")
  })

  it("orders newest first", async () => {
    const user = await makeUser()
    const older = await documentRepository.create(user.id, documentData({ title: "Older" }))
    await prisma.document.update({
      where: { id: older.id },
      data: { createdAt: new Date("2020-01-01T00:00:00.000Z") },
    })
    const newer = await documentRepository.create(user.id, documentData({ title: "Newer" }))

    const list = await documentRepository.listByUser(user.id, { query: "", tags: [] })
    expect(list[0].id).toBe(newer.id)
  })

  it("returns null for another user's document, exactly as for a missing one", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await documentRepository.create(owner.id, documentData())

    expect(await documentRepository.findById(other.id, created.id)).toBeNull()
    expect(await documentRepository.findById(other.id, "does-not-exist")).toBeNull()
  })

  it("never lists another user's documents", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await documentRepository.create(owner.id, documentData())

    expect(await documentRepository.listByUser(other.id, { query: "", tags: [] })).toEqual([])
  })
})

describe("search", () => {
  it("matches the title case-insensitively", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "Acme offer letter" }))
    await documentRepository.create(user.id, documentData({ title: "March payslip" }))

    const list = await documentRepository.listByUser(user.id, { query: "acme", tags: [] })
    expect(list.map((document) => document.title)).toEqual(["Acme offer letter"])
  })

  it("matches a substring in the middle of a word, which is what the box looks like it does", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "March payslip" }))

    const list = await documentRepository.listByUser(user.id, { query: "ysli", tags: [] })
    expect(list).toHaveLength(1)
  })

  it("matches the description", async () => {
    const user = await makeUser()
    await documentRepository.create(
      user.id,
      documentData({ title: "Untitled", description: "Signed by the CFO" })
    )

    expect(await documentRepository.listByUser(user.id, { query: "cfo", tags: [] })).toHaveLength(1)
  })

  it("matches the original filename, which is how people remember a document", async () => {
    const user = await makeUser()
    await documentRepository.create(
      user.id,
      documentData({ title: "Untitled", originalFilename: "Offer_Acme_Final.pdf" })
    )

    expect(
      await documentRepository.listByUser(user.id, { query: "acme_final", tags: [] })
    ).toHaveLength(1)
  })

  it("keeps userId at the TOP level of the where clause (§5.1c)", async () => {
    // The regression test for the day someone tidies `userId` into the OR
    // array: a single-user test would never notice.
    const owner = await makeUser()
    const other = await makeUser()
    await documentRepository.create(owner.id, documentData({ title: "Acme offer" }))

    expect(await documentRepository.listByUser(other.id, { query: "Acme", tags: [] })).toEqual([])
  })

  it("treats % as a literal, not as a wildcard", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "50% bonus letter" }))
    await documentRepository.create(user.id, documentData({ title: "50 percent bonus" }))

    const list = await documentRepository.listByUser(user.id, { query: "50%", tags: [] })
    expect(list.map((document) => document.title)).toEqual(["50% bonus letter"])
  })

  it("treats a bare % as a literal rather than matching everything", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "March payslip" }))

    expect(await documentRepository.listByUser(user.id, { query: "%", tags: [] })).toEqual([])
  })

  it("treats _ as a literal", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "offer_acme" }))
    await documentRepository.create(user.id, documentData({ title: "offerXacme" }))

    const list = await documentRepository.listByUser(user.id, { query: "offer_", tags: [] })
    expect(list.map((document) => document.title)).toEqual(["offer_acme"])
  })
})

describe("tag filtering", () => {
  it("narrows to documents carrying the tag", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ title: "A", tags: ["payslip"] }))
    await documentRepository.create(user.id, documentData({ title: "B", tags: ["offer letter"] }))

    const list = await documentRepository.listByUser(user.id, { query: "", tags: ["payslip"] })
    expect(list.map((document) => document.title)).toEqual(["A"])
  })

  it("narrows rather than widens with two tags (hasEvery, an AND)", async () => {
    const user = await makeUser()
    await documentRepository.create(
      user.id,
      documentData({ title: "Both", tags: ["payslip", "2026"] })
    )
    await documentRepository.create(user.id, documentData({ title: "One", tags: ["payslip"] }))

    const list = await documentRepository.listByUser(user.id, {
      query: "",
      tags: ["payslip", "2026"],
    })
    expect(list.map((document) => document.title)).toEqual(["Both"])
  })

  it("combines a tag filter with a query", async () => {
    const user = await makeUser()
    await documentRepository.create(
      user.id,
      documentData({ title: "Acme payslip", tags: ["payslip"] })
    )
    await documentRepository.create(
      user.id,
      documentData({ title: "Globex payslip", tags: ["payslip"] })
    )

    const list = await documentRepository.listByUser(user.id, {
      query: "acme",
      tags: ["payslip"],
    })
    expect(list.map((document) => document.title)).toEqual(["Acme payslip"])
  })
})

describe("listTags", () => {
  it("counts each tag across the user's documents, most used first", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ tags: ["payslip", "2026"] }))
    await documentRepository.create(user.id, documentData({ tags: ["payslip"] }))

    expect(await documentRepository.listTags(user.id)).toEqual([
      { tag: "payslip", count: 2 },
      { tag: "2026", count: 1 },
    ])
  })

  it("sorts equal counts alphabetically so the chip order is stable", async () => {
    const user = await makeUser()
    await documentRepository.create(user.id, documentData({ tags: ["beta", "alpha"] }))

    expect((await documentRepository.listTags(user.id)).map((entry) => entry.tag)).toEqual([
      "alpha",
      "beta",
    ])
  })

  it("never counts another user's tags", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await documentRepository.create(owner.id, documentData({ tags: ["payslip"] }))

    expect(await documentRepository.listTags(other.id)).toEqual([])
  })
})

describe("update", () => {
  it("updates metadata for its owner", async () => {
    const user = await makeUser()
    const created = await documentRepository.create(user.id, documentData())

    const updated = await documentRepository.update(user.id, created.id, {
      title: "Renamed",
      tags: ["payslip"],
    })
    expect(updated?.title).toBe("Renamed")
    expect(updated?.tags).toEqual(["payslip"])
  })

  it("clears description, companyId and expiresOn when they are omitted (the `undefined` trap)", async () => {
    // Prisma reads `undefined` as "don't change", so an omitted optional is a
    // silent no-op unless it is mapped to null. A test that only checked the
    // update succeeded would pass against the bug.
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const created = await documentRepository.create(
      user.id,
      documentData({
        description: "Signed copy",
        companyId: company.id,
        expiresOn: new Date("2030-06-01T00:00:00.000Z"),
      })
    )

    const updated = await documentRepository.update(user.id, created.id, {
      title: created.title,
      tags: [],
    })

    expect(updated?.description).toBeNull()
    expect(updated?.companyId).toBeNull()
    expect(updated?.expiresOn).toBeNull()
  })

  it("returns null for another user's document rather than updating it", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await documentRepository.create(owner.id, documentData())

    expect(
      await documentRepository.update(other.id, created.id, { title: "Hijacked", tags: [] })
    ).toBeNull()
    expect((await documentRepository.findById(owner.id, created.id))?.title).toBe(
      "Acme offer letter"
    )
  })

  it("never changes the stored bytes' identity", async () => {
    const user = await makeUser()
    const created = await documentRepository.create(user.id, documentData())

    const updated = await documentRepository.update(user.id, created.id, {
      title: "Renamed",
      tags: [],
    })
    expect(updated?.storageKey).toBe(created.storageKey)
    expect(updated?.contentType).toBe(created.contentType)
    expect(updated?.originalFilename).toBe(created.originalFilename)
  })
})

describe("remove", () => {
  it("deletes a document for its owner", async () => {
    const user = await makeUser()
    const created = await documentRepository.create(user.id, documentData())

    expect(await documentRepository.remove(user.id, created.id)).toBe(true)
    expect(await documentRepository.findById(user.id, created.id)).toBeNull()
  })

  it("refuses another user's document, indistinguishably from a missing one", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await documentRepository.create(owner.id, documentData())

    expect(await documentRepository.remove(other.id, created.id)).toBe(false)
    expect(await documentRepository.remove(other.id, "does-not-exist")).toBe(false)
    expect(await documentRepository.findById(owner.id, created.id)).not.toBeNull()
  })
})

describe("listByCompany", () => {
  it("lists only that company's documents, for that user", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const otherCompany = await makeCompany(user.id)
    const filed = await documentRepository.create(
      user.id,
      documentData({ companyId: company.id })
    )
    await documentRepository.create(user.id, documentData({ companyId: otherCompany.id }))

    const list = await documentRepository.listByCompany(user.id, company.id)
    expect(list.map((document) => document.id)).toEqual([filed.id])
  })

  it("returns nothing for another user", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await makeCompany(owner.id)
    await documentRepository.create(owner.id, documentData({ companyId: company.id }))

    expect(await documentRepository.listByCompany(other.id, company.id)).toEqual([])
  })
})

describe("the company relation", () => {
  it("survives its company being deleted, with companyId set to null (§6)", async () => {
    // The deliberate divergence from Application's Restrict: a document is a
    // complete artifact and the company is a label on it.
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const created = await documentRepository.create(
      user.id,
      documentData({ companyId: company.id })
    )

    await prisma.company.delete({ where: { id: company.id } })

    const survivor = await documentRepository.findById(user.id, created.id)
    expect(survivor).not.toBeNull()
    expect(survivor?.companyId).toBeNull()
  })
})

describe("countByUser", () => {
  it("counts only the caller's documents", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await documentRepository.create(owner.id, documentData())
    await documentRepository.create(owner.id, documentData())

    expect(await documentRepository.countByUser(owner.id)).toBe(2)
    expect(await documentRepository.countByUser(other.id)).toBe(0)
  })
})

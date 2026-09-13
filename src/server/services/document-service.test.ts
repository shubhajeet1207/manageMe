import { randomUUID } from "node:crypto"
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { MAX_UPLOAD_BYTES } from "@/server/files/content-types"
import * as documentRepository from "@/server/repositories/document-repository"
import { CompanyNotOwnedError } from "@/server/services/company-service"
import {
  DocumentNotFoundError,
  FileTooLargeError,
  UnsupportedFileTypeError,
  countDocuments,
  createDocument,
  deleteDocument,
  getDocument,
  listDocumentTags,
  listDocuments,
  listDocumentsForCompany,
  readDocumentFile,
  updateDocumentMetadata,
} from "./document-service"

const createdUserIds: string[] = []
let uploadsRoot: string
const originalUploadsDir = process.env.UPLOADS_DIR

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nfake offer letter\n%%EOF\n")
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const WEBP_BYTES = (() => {
  const bytes = new Uint8Array(32)
  bytes.set(new TextEncoder().encode("RIFF"), 0)
  bytes.set(new TextEncoder().encode("WEBP"), 8)
  return bytes
})()
const HTML_BYTES = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>")
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

beforeAll(async () => {
  uploadsRoot = await mkdtemp(path.join(tmpdir(), "manageme-document-svc-"))
  process.env.UPLOADS_DIR = uploadsRoot
})

afterAll(async () => {
  if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR
  else process.env.UPLOADS_DIR = originalUploadsDir
  await rm(uploadsRoot, { recursive: true, force: true })
})

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Document Service Test",
      email: `document-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

async function makeCompany(userId: string, name = `Acme ${randomUUID().slice(0, 8)}`) {
  return prisma.company.create({ data: { userId, name } })
}

function uploadInput(overrides: Partial<Parameters<typeof createDocument>[1]> = {}) {
  return {
    title: "Acme offer letter",
    tags: [] as string[],
    originalFilename: "Offer_Acme_Final.pdf",
    declaredContentType: "application/pdf",
    bytes: PDF_BYTES,
    ...overrides,
  }
}

function storedPath(storageKey: string) {
  return path.join(uploadsRoot, storageKey)
}

async function exists(file: string) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function storedFileCount(userId: string) {
  try {
    return (await readdir(path.join(uploadsRoot, "documents", userId))).length
  } catch {
    return 0
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("createDocument", () => {
  it("writes bytes and a row, and returns the row", async () => {
    const user = await makeUser()
    const document = await createDocument(user.id, uploadInput())

    expect(document.title).toBe("Acme offer letter")
    expect(document.contentType).toBe("application/pdf")
    expect(document.sizeBytes).toBe(PDF_BYTES.byteLength)
    expect(await exists(storedPath(document.storageKey))).toBe(true)
  })

  it("builds a key out of server-generated segments only (§8.4)", async () => {
    const user = await makeUser()
    const document = await createDocument(
      user.id,
      uploadInput({ originalFilename: "../../etc/passwd.pdf" })
    )

    expect(document.storageKey).toMatch(
      new RegExp(`^documents/${user.id}/[0-9a-f-]{36}\\.pdf$`)
    )
    expect(document.storageKey).not.toContain("passwd")
    expect(document.originalFilename).toBe("../../etc/passwd.pdf")
  })

  it("takes the key's extension from the registry, never from the client's filename", async () => {
    const user = await makeUser()
    const document = await createDocument(
      user.id,
      uploadInput({
        originalFilename: "certificate.pdf.exe",
        declaredContentType: "image/png",
        bytes: PNG_BYTES,
      })
    )

    expect(document.storageKey.endsWith(".png")).toBe(true)
  })

  it.each([
    ["application/pdf", PDF_BYTES, ".pdf"],
    ["image/png", PNG_BYTES, ".png"],
    ["image/jpeg", JPEG_BYTES, ".jpg"],
    ["image/webp", WEBP_BYTES, ".webp"],
  ])("accepts %s", async (declaredContentType, bytes, extension) => {
    const user = await makeUser()
    const document = await createDocument(
      user.id,
      uploadInput({ declaredContentType, bytes, originalFilename: `scan${extension}` })
    )

    expect(document.contentType).toBe(declaredContentType)
    expect(document.storageKey.endsWith(extension)).toBe(true)
  })

  it("refuses HTML renamed to look like a PNG, and writes nothing (§8.3)", async () => {
    const user = await makeUser()
    await expect(
      createDocument(
        user.id,
        uploadInput({
          originalFilename: "not-an-image.png",
          declaredContentType: "image/png",
          bytes: HTML_BYTES,
        })
      )
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError)

    expect(await documentRepository.countByUser(user.id)).toBe(0)
    expect(await storedFileCount(user.id)).toBe(0)
  })

  it("refuses an SVG, whatever it declares itself to be (§8.2)", async () => {
    const user = await makeUser()
    for (const declaredContentType of ["image/svg+xml", "image/png"]) {
      await expect(
        createDocument(
          user.id,
          uploadInput({
            originalFilename: "diagram.svg",
            declaredContentType,
            bytes: SVG_BYTES,
          })
        )
      ).rejects.toBeInstanceOf(UnsupportedFileTypeError)
    }
    expect(await documentRepository.countByUser(user.id)).toBe(0)
    expect(await storedFileCount(user.id)).toBe(0)
  })

  it("refuses a PDF declared as an image rather than silently re-typing it", async () => {
    const user = await makeUser()
    await expect(
      createDocument(user.id, uploadInput({ declaredContentType: "image/png", bytes: PDF_BYTES }))
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError)
  })

  it("refuses a file over the cap with a size-specific error", async () => {
    const user = await makeUser()
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    bytes.set(PDF_BYTES.slice(0, 5))
    await expect(createDocument(user.id, uploadInput({ bytes }))).rejects.toBeInstanceOf(
      FileTooLargeError
    )
    expect(await storedFileCount(user.id)).toBe(0)
  })

  it("stores the tags, description, expiry and company it is given", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const expiresOn = new Date("2030-06-01T00:00:00.000Z")
    const document = await createDocument(
      user.id,
      uploadInput({
        description: "Signed copy",
        tags: ["offer letter", "Acme"],
        companyId: company.id,
        expiresOn,
      })
    )

    expect(document.tags).toEqual(["offer letter", "Acme"])
    expect(document.description).toBe("Signed copy")
    expect(document.companyId).toBe(company.id)
    expect(document.expiresOn?.toISOString()).toBe(expiresOn.toISOString())
  })

  it("refuses another user's companyId THROUGH the call site, and writes nothing (§5.1b)", async () => {
    // A guard with a passing unit test and no caller has shipped in this
    // codebase before, so this goes through createDocument rather than calling
    // assertCompanyOwned directly.
    const owner = await makeUser()
    const attacker = await makeUser()
    const company = await makeCompany(owner.id)

    await expect(
      createDocument(attacker.id, uploadInput({ companyId: company.id }))
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)

    expect(await documentRepository.countByUser(attacker.id)).toBe(0)
    expect(await storedFileCount(attacker.id)).toBe(0)
  })

  it("removes the stored object when the row insert fails (§8.7 step 6)", async () => {
    const user = await makeUser()
    vi.spyOn(prisma.document, "create").mockRejectedValueOnce(new Error("insert failed"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(createDocument(user.id, uploadInput())).rejects.toThrow("insert failed")

    expect(await storedFileCount(user.id)).toBe(0)
    expect(await documentRepository.countByUser(user.id)).toBe(0)
  })
})

describe("getDocument and listDocuments", () => {
  it("reads back the caller's own document", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())

    expect((await getDocument(user.id, created.id)).id).toBe(created.id)
  })

  it("throws the same not-found for another user's document as for a missing id", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createDocument(owner.id, uploadInput())

    await expect(getDocument(other.id, created.id)).rejects.toBeInstanceOf(DocumentNotFoundError)
    await expect(getDocument(other.id, "does-not-exist")).rejects.toBeInstanceOf(
      DocumentNotFoundError
    )
  })

  it("does not leak another user's document through search (§5.1c)", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await createDocument(owner.id, uploadInput({ title: "Acme offer" }))

    expect(await listDocuments(other.id, { query: "Acme", tags: [] })).toEqual([])
    expect(await countDocuments(other.id)).toBe(0)
    expect(await listDocumentTags(other.id)).toEqual([])
  })

  it("lists a company's documents only for their owner", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await makeCompany(owner.id)
    await createDocument(owner.id, uploadInput({ companyId: company.id }))

    expect(await listDocumentsForCompany(owner.id, company.id)).toHaveLength(1)
    expect(await listDocumentsForCompany(other.id, company.id)).toEqual([])
  })
})

describe("updateDocumentMetadata", () => {
  it("updates the metadata", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())

    const updated = await updateDocumentMetadata(user.id, created.id, {
      title: "Acme offer (signed)",
      tags: ["offer letter"],
    })
    expect(updated.title).toBe("Acme offer (signed)")
    expect(updated.tags).toEqual(["offer letter"])
  })

  it("clears each optional field when it is omitted (the `undefined` trap)", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const created = await createDocument(
      user.id,
      uploadInput({
        description: "Signed copy",
        companyId: company.id,
        expiresOn: new Date("2030-06-01T00:00:00.000Z"),
      })
    )

    const updated = await updateDocumentMetadata(user.id, created.id, {
      title: created.title,
      tags: [],
    })
    expect(updated.description).toBeNull()
    expect(updated.companyId).toBeNull()
    expect(updated.expiresOn).toBeNull()
  })

  it("refuses another user's document, indistinguishably from a missing one", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createDocument(owner.id, uploadInput())

    await expect(
      updateDocumentMetadata(other.id, created.id, { title: "Hijacked", tags: [] })
    ).rejects.toBeInstanceOf(DocumentNotFoundError)
    expect((await getDocument(owner.id, created.id)).title).toBe("Acme offer letter")
  })

  it("refuses another user's companyId THROUGH the call site, and changes nothing (§5.1b)", async () => {
    const owner = await makeUser()
    const attacker = await makeUser()
    const foreignCompany = await makeCompany(owner.id)
    const created = await createDocument(attacker.id, uploadInput())

    await expect(
      updateDocumentMetadata(attacker.id, created.id, {
        title: "Filed elsewhere",
        tags: [],
        companyId: foreignCompany.id,
      })
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)

    const unchanged = await getDocument(attacker.id, created.id)
    expect(unchanged.title).toBe("Acme offer letter")
    expect(unchanged.companyId).toBeNull()
  })

  it("allows unlinking: an absent companyId skips the guard", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const created = await createDocument(user.id, uploadInput({ companyId: company.id }))

    const updated = await updateDocumentMetadata(user.id, created.id, {
      title: created.title,
      tags: [],
    })
    expect(updated.companyId).toBeNull()
  })
})

describe("deleteDocument", () => {
  it("removes both the row and the stored object (§8.7)", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())
    const file = storedPath(created.storageKey)
    expect(await exists(file)).toBe(true)

    await deleteDocument(user.id, created.id)

    expect(await exists(file)).toBe(false)
    expect(await documentRepository.countByUser(user.id)).toBe(0)
  })

  it("refuses another user's document and leaves the bytes alone", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createDocument(owner.id, uploadInput())

    await expect(deleteDocument(other.id, created.id)).rejects.toBeInstanceOf(
      DocumentNotFoundError
    )
    expect(await exists(storedPath(created.storageKey))).toBe(true)
  })

  it("succeeds even when the stored object has already gone", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())
    await rm(storedPath(created.storageKey), { force: true })

    await expect(deleteDocument(user.id, created.id)).resolves.toBeUndefined()
    expect(await documentRepository.countByUser(user.id)).toBe(0)
  })
})

describe("readDocumentFile", () => {
  it("returns the row and the exact bytes that were stored", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())

    const { document, bytes } = await readDocumentFile(user.id, created.id)
    expect(document.id).toBe(created.id)
    expect(Array.from(bytes)).toEqual(Array.from(PDF_BYTES))
    expect(Array.from(await readFile(storedPath(created.storageKey)))).toEqual(
      Array.from(PDF_BYTES)
    )
  })

  it("refuses another user's document — the unit-level proof behind §8.6's 404", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createDocument(owner.id, uploadInput())

    await expect(readDocumentFile(other.id, created.id)).rejects.toBeInstanceOf(
      DocumentNotFoundError
    )
  })

  it("answers a row whose object has vanished with the same not-found", async () => {
    const user = await makeUser()
    const created = await createDocument(user.id, uploadInput())
    await rm(storedPath(created.storageKey), { force: true })
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(readDocumentFile(user.id, created.id)).rejects.toBeInstanceOf(
      DocumentNotFoundError
    )
  })
})

describe("the company relation", () => {
  it("keeps documents when their company is deleted, with no company left on them", async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)
    const created = await createDocument(user.id, uploadInput({ companyId: company.id }))

    await expect(prisma.company.delete({ where: { id: company.id } })).resolves.toBeTruthy()

    const survivor = await getDocument(user.id, created.id)
    expect(survivor.companyId).toBeNull()
    expect(survivor.company).toBeNull()
    expect(await exists(storedPath(created.storageKey))).toBe(true)
  })
})

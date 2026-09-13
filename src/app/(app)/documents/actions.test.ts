import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as documentRepository from "@/server/repositories/document-repository"
import { createDocument } from "@/server/services/document-service"
import { deleteDocumentAction } from "./actions"

/**
 * §12 audit regression: `deleteDocumentAction` used to take a bare `id:
 * string` with no runtime validation. Because Prisma accepts a filter object
 * where a plain string is expected, a Server Action call carrying
 * `{ id: { not: "" } }` reached `deleteMany({ where: { id, userId } })` and
 * deleted every document the caller owned in one request — reproduced live as
 * 8 rows deleted for one delete click. This file proves that is closed and
 * stays closed.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const authMock = vi.fn()
vi.mock("@/lib/auth/auth", () => ({ auth: () => authMock() }))

const createdUserIds: string[] = []
let uploadsRoot: string
const originalUploadsDir = process.env.UPLOADS_DIR

beforeAll(async () => {
  uploadsRoot = await mkdtemp(path.join(tmpdir(), "manageme-document-actions-"))
  process.env.UPLOADS_DIR = uploadsRoot
})

afterAll(async () => {
  if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR
  else process.env.UPLOADS_DIR = originalUploadsDir
  await rm(uploadsRoot, { recursive: true, force: true })
})

afterEach(async () => {
  vi.clearAllMocks()
  if (createdUserIds.length > 0) {
    const ids = [...createdUserIds]
    createdUserIds.length = 0
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  }
})

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Documents Action Test",
      email: `documents-action-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

async function makeDocuments(userId: string, count: number) {
  const bytes = new TextEncoder().encode("%PDF-1.7\nfake\n%%EOF\n")
  for (let i = 0; i < count; i++) {
    await createDocument(userId, {
      title: `Document ${i}`,
      tags: [],
      originalFilename: `doc-${i}.pdf`,
      declaredContentType: "application/pdf",
      bytes,
    })
  }
}

describe("deleteDocumentAction", () => {
  it("rejects a filter-object id instead of deleting every document it matches", async () => {
    const user = await makeUser()
    authMock.mockReturnValue({ user: { id: user.id } })
    await makeDocuments(user.id, 8)
    expect(await documentRepository.countByUser(user.id)).toBe(8)

    // The exact shape the auditor used: a Prisma "not equal to empty string"
    // filter, which matches every row for this user's `userId` scope.
    const result = await deleteDocumentAction({ id: { not: "" } })

    expect(result.success).toBe(false)
    expect(await documentRepository.countByUser(user.id)).toBe(8)
  })

  it("still deletes the one document a valid id names", async () => {
    const user = await makeUser()
    authMock.mockReturnValue({ user: { id: user.id } })
    await makeDocuments(user.id, 2)
    const [first] = await documentRepository.listByUser(user.id, { query: "", tags: [] })

    const result = await deleteDocumentAction({ id: first.id })

    expect(result.success).toBe(true)
    expect(await documentRepository.countByUser(user.id)).toBe(1)
  })
})

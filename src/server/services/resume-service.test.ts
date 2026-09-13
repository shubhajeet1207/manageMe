import { randomUUID } from "node:crypto"
import { access, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { MAX_UPLOAD_BYTES } from "@/server/storage/pdf"
import {
  FileTooLargeError,
  InvalidPdfError,
  ResumeInUseError,
  ResumeNameTakenError,
  ResumeNotFoundError,
  ResumeVersionNotFoundError,
  ResumeVersionNotOwnedError,
  assertResumeVersionOwned,
  createResume,
  deleteResume,
  getResume,
  getVersionForDownload,
  listResumes,
  readVersionFile,
  setCurrentVersion,
  updateResume,
  uploadResumeVersion,
} from "./resume-service"

const createdUserIds: string[] = []
let uploadsRoot: string
const originalUploadsDir = process.env.UPLOADS_DIR

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nfake resume body\n%%EOF\n")
const HTML_BYTES = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>")

beforeAll(async () => {
  uploadsRoot = await mkdtemp(path.join(tmpdir(), "manageme-resume-svc-"))
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
      name: "Resume Service Test",
      email: `resume-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

function uploadInput(overrides: Partial<Parameters<typeof uploadResumeVersion>[1]> = {}) {
  return {
    resumeId: "",
    label: "October rewrite",
    originalFilename: "my resume.pdf",
    declaredContentType: "application/pdf",
    bytes: PDF_BYTES,
    ...overrides,
  }
}

/** A user with a resume slot holding one uploaded version. */
async function makeUserWithResume(name = "Backend SWE") {
  const user = await makeUser()
  const resume = await createResume(user.id, { name })
  const version = await uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id }))
  return { user, resume, version }
}

async function makeCompany(userId: string) {
  return prisma.company.create({ data: { userId, name: `Acme ${randomUUID().slice(0, 8)}` } })
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

afterEach(async () => {
  vi.restoreAllMocks()
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.application.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { resumeVersion: { userId: { in: ids } } }] },
  })
  await prisma.resumeVersion.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("createResume and updateResume", () => {
  it("creates a slot", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })
    expect(resume.name).toBe("Backend SWE")
  })

  it("refuses a duplicate name for the same user", async () => {
    const user = await makeUser()
    await createResume(user.id, { name: "Backend SWE" })

    await expect(createResume(user.id, { name: "Backend SWE" })).rejects.toBeInstanceOf(
      ResumeNameTakenError
    )
  })

  it("allows two users to use the same slot name", async () => {
    const one = await makeUser()
    const two = await makeUser()
    await createResume(one.id, { name: "Backend SWE" })

    await expect(createResume(two.id, { name: "Backend SWE" })).resolves.toBeDefined()
  })

  it("renames a slot", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })

    const updated = await updateResume(user.id, resume.id, { name: "Backend / Platform" })
    expect(updated.name).toBe("Backend / Platform")
  })

  it("refuses a rename onto another of the user's slots", async () => {
    const user = await makeUser()
    await createResume(user.id, { name: "Backend SWE" })
    const other = await createResume(user.id, { name: "Data roles" })

    await expect(updateResume(user.id, other.id, { name: "Backend SWE" })).rejects.toBeInstanceOf(
      ResumeNameTakenError
    )
  })
})

describe("uploadResumeVersion", () => {
  it("stores the bytes and records the version", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })

    const version = await uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id }))

    expect(version.label).toBe("October rewrite")
    expect(version.sizeBytes).toBe(PDF_BYTES.byteLength)
    expect(version.contentType).toBe("application/pdf")
    expect(await exists(storedPath(version.storageKey))).toBe(true)
  })

  it("derives the storage key server-side and keeps the filename display-only", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })

    const version = await uploadResumeVersion(
      user.id,
      uploadInput({ resumeId: resume.id, originalFilename: "../../etc/passwd.pdf" })
    )

    // The key is built from ids we control: no part of the client's filename
    // reaches it, so there is no path-traversal surface (§8.1 Control 1).
    expect(version.storageKey).toMatch(
      new RegExp(`^resumes/${user.id}/[0-9a-f-]{36}\\.pdf$`)
    )
    expect(version.storageKey).not.toContain("..")
    expect(version.storageKey).not.toContain("passwd")
    // The name survives for display only.
    expect(version.originalFilename).toBe("../../etc/passwd.pdf")
    expect(await exists(storedPath(version.storageKey))).toBe(true)
    // And nothing was written outside the uploads root.
    expect(await exists(path.join(path.dirname(uploadsRoot), "etc"))).toBe(false)
  })

  it("makes the new version current — uploading adds, never replaces", async () => {
    const { user, resume, version } = await makeUserWithResume()

    const second = await uploadResumeVersion(
      user.id,
      uploadInput({ resumeId: resume.id, label: "November" })
    )

    const reloaded = await getResume(user.id, resume.id)
    expect(reloaded.currentVersionId).toBe(second.id)
    expect(reloaded._count.versions).toBe(2)
    expect(await exists(storedPath(version.storageKey))).toBe(true)
  })

  it("rejects an HTML file declared as a PDF, and writes nothing", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })

    await expect(
      uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id, bytes: HTML_BYTES }))
    ).rejects.toBeInstanceOf(InvalidPdfError)

    expect(await getResume(user.id, resume.id)).toMatchObject({ currentVersionId: null })
    expect(await readdir(path.join(uploadsRoot, "resumes", user.id)).catch(() => [])).toHaveLength(0)
  })

  it("rejects a file over the cap regardless of what the client declared", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    big.set(PDF_BYTES.slice(0, 5))

    await expect(
      uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id, bytes: big }))
    ).rejects.toBeInstanceOf(FileTooLargeError)
    expect(await readdir(path.join(uploadsRoot, "resumes", user.id)).catch(() => [])).toHaveLength(0)
  })

  it("removes the stored object when the database write fails (§8.5 rollback)", async () => {
    const user = await makeUser()
    const resume = await createResume(user.id, { name: "Backend SWE" })
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("transaction failed"))

    await expect(
      uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id }))
    ).rejects.toThrow()

    // Storage-first ordering means an orphan is possible; step 6 cleans it up.
    expect(await readdir(path.join(uploadsRoot, "resumes", user.id)).catch(() => [])).toHaveLength(0)
    expect(await prisma.resumeVersion.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe("setCurrentVersion", () => {
  it("moves the pointer to an earlier version", async () => {
    const { user, resume, version } = await makeUserWithResume()
    await uploadResumeVersion(user.id, uploadInput({ resumeId: resume.id, label: "November" }))

    const updated = await setCurrentVersion(user.id, resume.id, version.id)
    expect(updated.currentVersionId).toBe(version.id)
  })

  it("refuses a version that belongs to a different slot", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const other = await createResume(user.id, { name: "Data roles" })

    await expect(setCurrentVersion(user.id, other.id, version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotFoundError
    )
    expect((await getResume(user.id, resume.id)).currentVersionId).toBe(version.id)
  })
})

describe("deleteResume", () => {
  it("deletes the slot, its versions and their stored objects", async () => {
    const { user, resume, version } = await makeUserWithResume()

    await deleteResume(user.id, resume.id)

    await expect(getResume(user.id, resume.id)).rejects.toBeInstanceOf(ResumeNotFoundError)
    expect(await prisma.resumeVersion.count({ where: { id: version.id } })).toBe(0)
    expect(await exists(storedPath(version.storageKey))).toBe(false)
  })

  it("refuses when an application was sent a version of it, and deletes nothing", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const company = await makeCompany(user.id)
    await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company.id,
        roleTitle: "Engineer",
        resumeVersionId: version.id,
      },
    })

    await expect(deleteResume(user.id, resume.id)).rejects.toMatchObject({
      name: "ResumeInUseError",
      count: 1,
    })
    await expect(deleteResume(user.id, resume.id)).rejects.toBeInstanceOf(ResumeInUseError)

    // Neither the row nor the object.
    expect(await prisma.resumeVersion.count({ where: { id: version.id } })).toBe(1)
    expect(await exists(storedPath(version.storageKey))).toBe(true)
  })
})

describe("getVersionForDownload and readVersionFile", () => {
  it("returns the version and its bytes to its owner", async () => {
    const { user, version } = await makeUserWithResume()

    expect((await getVersionForDownload(user.id, version.id)).id).toBe(version.id)
    const file = await readVersionFile(user.id, version.id)
    expect(Array.from(file.bytes)).toEqual(Array.from(PDF_BYTES))
    expect(file.version.originalFilename).toBe("my resume.pdf")
  })

  it("throws when the row exists but the object does not", async () => {
    const { user, version } = await makeUserWithResume()
    await rm(storedPath(version.storageKey), { force: true })

    await expect(readVersionFile(user.id, version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotFoundError
    )
  })
})

describe("listResumes", () => {
  it("carries the §9 figures with each slot", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const company = await makeCompany(user.id)
    await prisma.application.createMany({
      data: [
        {
          userId: user.id,
          companyId: company.id,
          roleTitle: "A",
          status: "INTERVIEW",
          resumeVersionId: version.id,
        },
        {
          userId: user.id,
          companyId: company.id,
          roleTitle: "B",
          status: "REJECTED",
          resumeVersionId: version.id,
        },
      ],
    })

    const listed = (await listResumes(user.id)).find((r) => r.id === resume.id)
    expect(listed?.stats).toEqual({
      applications: 2,
      atInterviewOrBeyond: 1,
      offers: 0,
      rejected: 1,
    })
    expect(listed?._count.versions).toBe(1)
  })
})

describe("ownership", () => {
  it("does not list another user's resumes", async () => {
    await makeUserWithResume()
    const other = await makeUser()

    expect(await listResumes(other.id)).toHaveLength(0)
  })

  it("does not read another user's resume", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(getResume(other.id, owner.resume.id)).rejects.toBeInstanceOf(ResumeNotFoundError)
  })

  it("does not rename another user's resume, and leaves it unchanged", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(
      updateResume(other.id, owner.resume.id, { name: "Hacked", notes: "Hacked" })
    ).rejects.toBeInstanceOf(ResumeNotFoundError)

    const untouched = await getResume(owner.user.id, owner.resume.id)
    expect(untouched.name).toBe("Backend SWE")
    expect(untouched.notes).toBeNull()
  })

  it("does not delete another user's resume, and leaves its rows and objects intact", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(deleteResume(other.id, owner.resume.id)).rejects.toBeInstanceOf(ResumeNotFoundError)

    expect((await getResume(owner.user.id, owner.resume.id)).id).toBe(owner.resume.id)
    expect(await prisma.resumeVersion.count({ where: { id: owner.version.id } })).toBe(1)
    expect(await exists(storedPath(owner.version.storageKey))).toBe(true)
  })

  it("does not upload a version into another user's resume, and writes no bytes", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(
      uploadResumeVersion(other.id, uploadInput({ resumeId: owner.resume.id, label: "Injected" }))
    ).rejects.toBeInstanceOf(ResumeNotFoundError)

    expect(await prisma.resumeVersion.count({ where: { resumeId: owner.resume.id } })).toBe(1)
    expect((await getResume(owner.user.id, owner.resume.id)).currentVersionId).toBe(owner.version.id)
    expect(await readdir(path.join(uploadsRoot, "resumes", other.id)).catch(() => [])).toHaveLength(
      0
    )
  })

  it("does not set another user's version current on the attacker's own resume", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUserWithResume("Data roles")

    await expect(
      setCurrentVersion(other.user.id, other.resume.id, owner.version.id)
    ).rejects.toBeInstanceOf(ResumeVersionNotFoundError)

    expect((await getResume(other.user.id, other.resume.id)).currentVersionId).toBe(
      other.version.id
    )
    expect((await getResume(owner.user.id, owner.resume.id)).currentVersionId).toBe(
      owner.version.id
    )
  })

  it("does not serve another user's file — the unit-level proof behind §8.4's 404", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(getVersionForDownload(other.id, owner.version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotFoundError
    )
    await expect(readVersionFile(other.id, owner.version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotFoundError
    )
    // The owner's bytes are still there, untouched.
    expect(Array.from((await readVersionFile(owner.user.id, owner.version.id)).bytes)).toEqual(
      Array.from(PDF_BYTES)
    )
  })

  it("is indistinguishable between a missing resume and someone else's", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    const notYours = await getResume(other.id, owner.resume.id).catch((error) => error)
    const notThere = await getResume(other.id, "does-not-exist").catch((error) => error)
    expect(notYours.constructor).toBe(notThere.constructor)
    expect(notYours.message).toBe(notThere.message)
  })
})

describe("assertResumeVersionOwned", () => {
  // Repository scoping cannot catch this one: the application row being
  // written is the caller's, so `where: { userId }` still matches — the
  // resumeVersionId in the payload is an arbitrary client-supplied id.
  it("accepts a version the caller owns", async () => {
    const { user, version } = await makeUserWithResume()

    await expect(assertResumeVersionOwned(user.id, version.id)).resolves.toBeUndefined()
  })

  it("refuses another user's version", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    await expect(assertResumeVersionOwned(other.id, owner.version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotOwnedError
    )
  })

  it("refuses a version id that does not exist, with the identical error", async () => {
    const user = await makeUser()
    const owner = await makeUserWithResume()

    const notYours = await assertResumeVersionOwned(user.id, owner.version.id).catch((e) => e)
    const notThere = await assertResumeVersionOwned(user.id, "does-not-exist").catch((e) => e)
    expect(notYours.constructor).toBe(notThere.constructor)
    // The message must not confirm that the version exists.
    expect(notYours.message).toBe(notThere.message)
    expect(notYours.message).toBe("Resume not found")
  })

  it("is what stops a cross-tenant link the database would otherwise accept", async () => {
    // Written directly, bypassing the guard: the foreign key is satisfied and
    // every `where: { userId }` clause on the application still matches. The
    // guard is the only thing between a user and another user's file.
    const owner = await makeUserWithResume()
    const other = await makeUser()
    const company = await makeCompany(other.id)

    const smuggled = await prisma.application.create({
      data: {
        userId: other.id,
        companyId: company.id,
        roleTitle: "Engineer",
        resumeVersionId: owner.version.id,
      },
    })
    expect(smuggled.resumeVersionId).toBe(owner.version.id)

    await expect(assertResumeVersionOwned(other.id, owner.version.id)).rejects.toBeInstanceOf(
      ResumeVersionNotOwnedError
    )
  })
})

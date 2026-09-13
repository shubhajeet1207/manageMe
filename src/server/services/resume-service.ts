import { randomUUID } from "node:crypto"
import * as resumeRepository from "@/server/repositories/resume-repository"
import type {
  ApplicationWithCompanyAndVersion,
  ResumeProjectData,
  ResumeStats,
  ResumeVersionWithResume,
  ResumeWithCurrentVersion,
} from "@/server/repositories/resume-repository"
import { getStorage } from "@/server/storage"
import { PDF_CONTENT_TYPE, validatePdfUpload } from "@/server/files/pdf"
import type {
  CreateResumeInput,
  CreateResumeProjectInput,
} from "@/server/validators/resume-schemas"
import type { Resume, ResumeProject, ResumeVersion } from "@prisma/client"

export class ResumeNameTakenError extends Error {
  constructor() {
    super("You already have a resume with this name")
    this.name = "ResumeNameTakenError"
  }
}

export class ResumeNotFoundError extends Error {
  constructor() {
    super("Resume not found")
    this.name = "ResumeNotFoundError"
  }
}

export class ResumeInUseError extends Error {
  constructor(public readonly count: number) {
    super(
      `${count} application${count === 1 ? " was" : "s were"} sent a version of this resume. Unlink ${
        count === 1 ? "it" : "them"
      } first.`
    )
    this.name = "ResumeInUseError"
  }
}

export class ResumeProjectNotFoundError extends Error {
  constructor() {
    super("Project not found")
    this.name = "ResumeProjectNotFoundError"
  }
}

export class ResumeVersionNotFoundError extends Error {
  constructor() {
    super("Resume version not found")
    this.name = "ResumeVersionNotFoundError"
  }
}

/** Deliberately says "Resume not found": it must not confirm that the version
 *  exists, because a not-yours answer and a not-there answer are the same
 *  answer (§12.2). */
export class ResumeVersionNotOwnedError extends Error {
  constructor() {
    super("Resume not found")
    this.name = "ResumeVersionNotOwnedError"
  }
}

export class InvalidPdfError extends Error {
  constructor() {
    super("That file isn't a PDF.")
    this.name = "InvalidPdfError"
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("This file is larger than 10MB.")
    this.name = "FileTooLargeError"
  }
}

/** A storage failure the user can do nothing about. Its message is generic on
 *  purpose: a Node `ENOENT` or `EACCES` carries an absolute path, and no
 *  filesystem path ever reaches the client (§12.2). */
export class StorageError extends Error {
  constructor() {
    super("Something went wrong. Please try again.")
    this.name = "StorageError"
  }
}

export type ResumeLibraryItem = ResumeWithCurrentVersion & { stats: ResumeStats }

export type ResumeDetail = {
  resume: ResumeWithCurrentVersion
  versions: ResumeVersion[]
  projects: ResumeProject[]
  applications: ApplicationWithCompanyAndVersion[]
  stats: ResumeStats
}

export type UploadResumeVersionData = {
  resumeId: string
  label: string
  /** The client's filename. Display metadata only — it never reaches a key. */
  originalFilename: string
  /** `file.type` from the browser: a claim, not evidence. Checked, not trusted. */
  declaredContentType: string
  bytes: Uint8Array
}

const EMPTY_STATS: ResumeStats = {
  applications: 0,
  atInterviewOrBeyond: 0,
  offers: 0,
  rejected: 0,
}

/**
 * The twin of `assertCompanyOwned` in application-service.ts, and it exists
 * for the identical reason: repository scoping cannot catch this. A write to
 * the caller's OWN application row can still carry someone else's
 * `resumeVersionId`, and every `where: { userId }` clause on the application
 * still matches. Without this check, a user could point their application at
 * another user's file and have the UI render a link to it.
 *
 * Call it on create and update whenever `resumeVersionId` is present; skip it
 * when it is undefined, because unlinking is always allowed.
 */
export async function assertResumeVersionOwned(
  userId: string,
  resumeVersionId: string
): Promise<void> {
  const version = await resumeRepository.findVersionById(userId, resumeVersionId)
  if (!version) throw new ResumeVersionNotOwnedError()
}

export async function listResumes(userId: string): Promise<ResumeLibraryItem[]> {
  const [resumes, stats] = await Promise.all([
    resumeRepository.listByUser(userId),
    resumeRepository.statsByResume(userId),
  ])
  return resumes.map((resume) => ({ ...resume, stats: stats.get(resume.id) ?? { ...EMPTY_STATS } }))
}

export function countUnlinkedApplications(userId: string): Promise<number> {
  return resumeRepository.countUnlinkedApplications(userId)
}

export function listVersionsForUser(userId: string): Promise<ResumeVersionWithResume[]> {
  return resumeRepository.listAllVersions(userId)
}

export async function getResume(userId: string, id: string): Promise<ResumeWithCurrentVersion> {
  const resume = await resumeRepository.findById(userId, id)
  if (!resume) throw new ResumeNotFoundError()
  return resume
}

/** Everything the detail page renders, in one place. */
export async function getResumeDetail(userId: string, id: string): Promise<ResumeDetail> {
  const resume = await getResume(userId, id)
  const [versions, projects, applications, stats] = await Promise.all([
    resumeRepository.listVersions(userId, id),
    resumeRepository.listProjects(userId, id),
    resumeRepository.listApplicationsForResume(userId, id),
    resumeRepository.statsByResume(userId),
  ])
  return { resume, versions, projects, applications, stats: stats.get(id) ?? { ...EMPTY_STATS } }
}

export async function createResume(userId: string, input: CreateResumeInput): Promise<Resume> {
  const existing = await resumeRepository.findByName(userId, input.name)
  if (existing) throw new ResumeNameTakenError()
  return resumeRepository.create(userId, input)
}

export async function updateResume(
  userId: string,
  id: string,
  input: CreateResumeInput
): Promise<Resume> {
  const clash = await resumeRepository.findByName(userId, input.name)
  if (clash && clash.id !== id) throw new ResumeNameTakenError()

  const updated = await resumeRepository.update(userId, id, input)
  if (!updated) throw new ResumeNotFoundError()
  return updated
}

/**
 * Delete a slot, its versions, and their stored objects.
 *
 * The refusal is checked first so the user gets a message naming the count
 * rather than a raw foreign-key error; `onDelete: Restrict` on
 * `Application.resumeVersion` is the backstop, not the messenger. Because the
 * refusal runs first, the `Resume → versions` cascade can only ever fire on
 * versions no application references.
 *
 * Rows go before bytes: a failed object delete leaves an orphan for Phase 7 to
 * sweep, where the inverse would leave a row whose preview 404s.
 */
export async function deleteResume(userId: string, id: string): Promise<void> {
  const resume = await resumeRepository.findById(userId, id)
  if (!resume) throw new ResumeNotFoundError()

  const inUse = await resumeRepository.countApplicationsForResume(userId, id)
  if (inUse > 0) throw new ResumeInUseError(inUse)

  const versions = await resumeRepository.listVersions(userId, id)

  let deleted: boolean
  try {
    deleted = await resumeRepository.remove(userId, id)
  } catch (error) {
    // A link created in the window between the count above and this delete
    // makes `onDelete: Restrict` fire and nothing is deleted. The re-count, not
    // the error's shape, is the evidence: Prisma reports a restrict violation
    // under a different code than a plain foreign-key one and has changed both
    // between versions, and the count is the number the §7 refusal names anyway.
    const raced = await resumeRepository.countApplicationsForResume(userId, id).catch(() => 0)
    if (raced > 0) throw new ResumeInUseError(raced)
    throw error
  }
  if (!deleted) throw new ResumeNotFoundError()

  const storage = getStorage()
  for (const version of versions) {
    try {
      await storage.remove(version.storageKey)
    } catch (error) {
      // Best effort: the rows are gone, so the object is unreferenced. Log the
      // key server-side; never surface a filesystem error to the client.
      console.error("Failed to remove stored object", version.storageKey, error)
    }
  }
}

/**
 * §8.5 — validate, verify the slot, write bytes, then write rows.
 *
 * Storage first because the inverse failure is worse: a row written before its
 * bytes can point at an object that never arrived, and the preview 404s on a
 * version the library insists exists. An orphaned object costs disk; a
 * dangling row costs correctness.
 */
export async function uploadResumeVersion(
  userId: string,
  data: UploadResumeVersionData
): Promise<ResumeVersion> {
  // 1. Validate the bytes themselves. The declared content type and size are
  //    client claims; `bytes` is the only unarguable number here.
  const validation = validatePdfUpload(data.bytes, data.declaredContentType, data.bytes.byteLength)
  if (!validation.ok) {
    if (validation.reason === "too-large") throw new FileTooLargeError()
    throw new InvalidPdfError()
  }

  // 2. The slot must be the caller's — checked before a single byte is written.
  const resume = await resumeRepository.findById(userId, data.resumeId)
  if (!resume) throw new ResumeNotFoundError()

  // 3. Every segment of the key is server-generated (§8.1): the session's
  //    userId, a fresh UUID, and a literal extension. No client text reaches
  //    it — `originalFilename` is stored on the row for display only.
  const storageKey = `resumes/${userId}/${randomUUID()}.pdf`

  const storage = getStorage()
  try {
    await storage.put(storageKey, data.bytes, PDF_CONTENT_TYPE)
  } catch (error) {
    console.error("Failed to store upload", storageKey, error)
    throw new StorageError()
  }

  try {
    const version = await resumeRepository.createVersionAndSetCurrent(userId, {
      resumeId: data.resumeId,
      label: data.label,
      originalFilename: data.originalFilename,
      storageKey,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: data.bytes.byteLength,
    })
    if (!version) throw new ResumeNotFoundError()
    return version
  } catch (error) {
    // Step 6: best effort, logged. The uncommon case (the process dying
    // between the put and the transaction) leaves an unreferenced object for
    // Phase 7's sweep.
    try {
      await storage.remove(storageKey)
    } catch (cleanupError) {
      console.error("Failed to roll back stored object", storageKey, cleanupError)
    }
    throw error
  }
}

/**
 * Point a slot at one of its own versions. The version must belong to that
 * resume AND to the caller — the check `setCurrentVersion` needs in the other
 * direction from `assertResumeVersionOwned`.
 */
export async function setCurrentVersion(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<ResumeWithCurrentVersion> {
  const resume = await resumeRepository.findById(userId, resumeId)
  if (!resume) throw new ResumeNotFoundError()

  const version = await resumeRepository.findVersionInResume(userId, resumeId, versionId)
  if (!version) throw new ResumeVersionNotFoundError()

  const ok = await resumeRepository.setCurrentVersion(userId, resumeId, versionId)
  if (!ok) throw new ResumeNotFoundError()

  return getResume(userId, resumeId)
}

/**
 * The row behind §8.4. Not found and not yours throw the same error, so the
 * route answers both with the same 404 and no body distinction.
 */
export async function getVersionForDownload(
  userId: string,
  versionId: string
): Promise<ResumeVersion> {
  const version = await resumeRepository.findVersionById(userId, versionId)
  if (!version) throw new ResumeVersionNotFoundError()
  return version
}

/**
 * The bytes behind §8.4, with the ownership check in front of them. A row
 * whose object is missing is a server-side problem, logged here and answered
 * with the same not-found the client gets for everything else.
 */
export async function readVersionFile(
  userId: string,
  versionId: string
): Promise<{ version: ResumeVersion; bytes: Uint8Array }> {
  const version = await getVersionForDownload(userId, versionId)

  const storage = getStorage()
  let bytes: Uint8Array | null
  try {
    bytes = await storage.get(version.storageKey)
  } catch (error) {
    console.error("Failed to read stored object", version.storageKey, error)
    throw new StorageError()
  }

  if (!bytes) {
    console.error("Resume version row has no stored object", version.id, version.storageKey)
    throw new ResumeVersionNotFoundError()
  }

  return { version, bytes }
}

/**
 * The twin of `assertResumeVersionOwned`, one entity over, and it exists for
 * the same reason repository scoping cannot cover: creating a project writes a
 * row carrying the CALLER'S OWN userId alongside a client-supplied `resumeId`,
 * so every `where: { userId }` clause on the write still matches. Without this
 * check a user could hang a project off another user's resume.
 *
 * It throws `ResumeNotFoundError` rather than a distinct error so a foreign
 * slot and a missing one are the same answer.
 */
export async function assertResumeOwned(userId: string, resumeId: string): Promise<void> {
  const resume = await resumeRepository.findById(userId, resumeId)
  if (!resume) throw new ResumeNotFoundError()
}

/** Replace a slot's skill tags. The list is authoritative: what is not in it
 *  is removed. */
export async function setResumeSkills(
  userId: string,
  resumeId: string,
  skills: string[]
): Promise<Resume> {
  const updated = await resumeRepository.setSkills(userId, resumeId, skills)
  if (!updated) throw new ResumeNotFoundError()
  return updated
}

export function listResumeProjects(userId: string, resumeId: string): Promise<ResumeProject[]> {
  return resumeRepository.listProjects(userId, resumeId)
}

export async function getResumeProject(userId: string, id: string): Promise<ResumeProject> {
  const project = await resumeRepository.findProjectById(userId, id)
  if (!project) throw new ResumeProjectNotFoundError()
  return project
}

export async function createResumeProject(
  userId: string,
  input: CreateResumeProjectInput
): Promise<ResumeProject> {
  await assertResumeOwned(userId, input.resumeId)
  return resumeRepository.createProject(userId, input)
}

export async function updateResumeProject(
  userId: string,
  id: string,
  input: ResumeProjectData
): Promise<ResumeProject> {
  const updated = await resumeRepository.updateProject(userId, id, input)
  if (!updated) throw new ResumeProjectNotFoundError()
  return updated
}

export async function deleteResumeProject(userId: string, id: string): Promise<void> {
  const deleted = await resumeRepository.removeProject(userId, id)
  if (!deleted) throw new ResumeProjectNotFoundError()
}

/**
 * Renumber a slot's projects. `projectIds` must be exactly that slot's
 * projects, so a list assembled from a stale page refuses rather than writing
 * half an order.
 */
export async function reorderResumeProjects(
  userId: string,
  resumeId: string,
  projectIds: string[]
): Promise<ResumeProject[]> {
  await assertResumeOwned(userId, resumeId)

  const ok = await resumeRepository.reorderProjects(userId, resumeId, projectIds)
  if (!ok) throw new ResumeProjectNotFoundError()

  return resumeRepository.listProjects(userId, resumeId)
}

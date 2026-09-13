import { prisma } from "@/lib/db/prisma"
import type { Application, Company, Resume, ResumeProject, ResumeVersion } from "@prisma/client"
import type { CreateResumeInput } from "@/server/validators/resume-schemas"

/**
 * Every function here takes `userId` first and includes it in the `where`
 * clause. Reads are `findFirst({ where: { id, userId } })`, never
 * `findUnique({ where: { id } })`; writes are `updateMany`/`deleteMany` scoped
 * by `{ id, userId }` and branch on `count`. A missing row and another user's
 * row are indistinguishable to every caller.
 */

export type ResumeWithCurrentVersion = Resume & {
  currentVersion: ResumeVersion | null
  _count: { versions: number }
}

export type ResumeVersionWithResume = ResumeVersion & { resume: Resume }

export type ApplicationWithCompanyAndVersion = Application & {
  company: Company
  resumeVersion: ResumeVersion | null
}

export type NewVersionData = {
  resumeId: string
  label: string
  originalFilename: string
  storageKey: string
  contentType: string
  sizeBytes: number
}

export type ResumeStats = {
  applications: number
  atInterviewOrBeyond: number
  offers: number
  rejected: number
}

/** Thrown inside the create-version transaction to roll it back. Never leaves
 *  this module: `createVersionAndSetCurrent` maps it to `null`. */
class ResumeNotOwned extends Error {}

export function listByUser(userId: string): Promise<ResumeWithCurrentVersion[]> {
  return prisma.resume.findMany({
    where: { userId },
    include: { currentVersion: true, _count: { select: { versions: true } } },
    orderBy: { name: "asc" },
  })
}

export function findById(userId: string, id: string): Promise<ResumeWithCurrentVersion | null> {
  return prisma.resume.findFirst({
    where: { id, userId },
    include: { currentVersion: true, _count: { select: { versions: true } } },
  })
}

export function findByName(userId: string, name: string): Promise<Resume | null> {
  return prisma.resume.findFirst({ where: { userId, name } })
}

export function create(userId: string, data: CreateResumeInput): Promise<Resume> {
  return prisma.resume.create({ data: { name: data.name, notes: data.notes ?? null, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateResumeInput
): Promise<Resume | null> {
  // `notes ?? null` rather than passing `data` through: an undefined value
  // means "leave unchanged" to Prisma, so a cleared field would never clear.
  const { count } = await prisma.resume.updateMany({
    where: { id, userId },
    data: { name: data.name, notes: data.notes ?? null },
  })
  if (count === 0) return null
  return prisma.resume.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.resume.deleteMany({ where: { id, userId } })
  return count > 0
}

export function listVersions(userId: string, resumeId: string): Promise<ResumeVersion[]> {
  return prisma.resumeVersion.findMany({
    where: { userId, resumeId },
    orderBy: { createdAt: "desc" },
  })
}

/** Every version the user owns, with its slot — the source for the grouped
 *  select on the application form. */
export function listAllVersions(userId: string): Promise<ResumeVersionWithResume[]> {
  return prisma.resumeVersion.findMany({
    where: { userId },
    include: { resume: true },
    orderBy: [{ resume: { name: "asc" } }, { createdAt: "desc" }],
  })
}

export function findVersionById(userId: string, id: string): Promise<ResumeVersion | null> {
  return prisma.resumeVersion.findFirst({ where: { id, userId } })
}

export function findVersionInResume(
  userId: string,
  resumeId: string,
  id: string
): Promise<ResumeVersion | null> {
  return prisma.resumeVersion.findFirst({ where: { id, userId, resumeId } })
}

/**
 * Insert a version and point its slot at it, in one transaction (§8.5 step 5).
 *
 * Returns null when the slot is not the caller's — including when it does not
 * exist — and writes nothing in that case. The ownership check is inside the
 * transaction, and the `updateMany` is scoped as well, so a row can never be
 * inserted into a slot the caller does not own.
 */
export async function createVersionAndSetCurrent(
  userId: string,
  data: NewVersionData
): Promise<ResumeVersion | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const resume = await tx.resume.findFirst({ where: { id: data.resumeId, userId } })
      if (!resume) throw new ResumeNotOwned()

      const version = await tx.resumeVersion.create({ data: { ...data, userId } })

      const { count } = await tx.resume.updateMany({
        where: { id: data.resumeId, userId },
        data: { currentVersionId: version.id },
      })
      if (count === 0) throw new ResumeNotOwned()

      return version
    })
  } catch (error) {
    if (error instanceof ResumeNotOwned) return null
    throw error
  }
}

/**
 * Point a slot at one of its own versions. False when the slot is not the
 * caller's, or the version is not the caller's, or the version belongs to a
 * different slot — all three indistinguishable, all three writing nothing.
 */
export async function setCurrentVersion(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<boolean> {
  const version = await prisma.resumeVersion.findFirst({
    where: { id: versionId, userId, resumeId },
  })
  if (!version) return false

  const { count } = await prisma.resume.updateMany({
    where: { id: resumeId, userId },
    data: { currentVersionId: versionId },
  })
  return count > 0
}

export function countApplicationsForResume(userId: string, resumeId: string): Promise<number> {
  // Lives here, querying prisma.application, following the precedent of
  // companyRepository.countApplications.
  return prisma.application.count({
    where: { userId, resumeVersion: { userId, resumeId } },
  })
}

export async function listApplicationsForResume(
  userId: string,
  resumeId: string
): Promise<ApplicationWithCompanyAndVersion[]> {
  const applications = await prisma.application.findMany({
    where: { userId, resumeVersion: { userId, resumeId } },
    include: { company: true, resumeVersion: true },
    orderBy: { updatedAt: "desc" },
  })

  // Prisma cannot put a `where` on a to-one `include`, so the join above
  // follows the foreign key whoever owns its target. The outer `where` makes
  // that safe, but this is the render path for the detail page — the same
  // belt-and-braces reasoning as `resolveStorageKey`'s final check: a `where`
  // loosened in a future edit drops the row here rather than showing another
  // user's file.
  return applications.filter(
    (application) =>
      application.resumeVersion?.userId === userId &&
      application.resumeVersion.resumeId === resumeId
  )
}

/** Applications with no resume linked. §9(b): these appear in no resume's
 *  numbers, so the library states the figure rather than quietly dropping them. */
export function countUnlinkedApplications(userId: string): Promise<number> {
  return prisma.application.count({ where: { userId, resumeVersionId: null } })
}

/**
 * §9 — derived entirely from the existing pipeline, in ONE grouped query
 * folded to resume level in memory. No new tracking tables.
 *
 * "At interview or beyond" is a CURRENT state, not a history: an application
 * that interviewed and was then rejected counts only in `rejected`. The UI
 * must label it as such rather than claiming a reached-stage rate.
 */
export async function statsByResume(userId: string): Promise<Map<string, ResumeStats>> {
  const [versions, groups] = await Promise.all([
    prisma.resumeVersion.findMany({ where: { userId }, select: { id: true, resumeId: true } }),
    prisma.application.groupBy({
      by: ["resumeVersionId", "status"],
      where: { userId, resumeVersionId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const resumeIdByVersionId = new Map(versions.map((version) => [version.id, version.resumeId]))
  const stats = new Map<string, ResumeStats>()

  for (const group of groups) {
    if (!group.resumeVersionId) continue
    const resumeId = resumeIdByVersionId.get(group.resumeVersionId)
    // A version id the user does not own: another user's file, linked before
    // the service guard existed. It belongs to no resume of theirs.
    if (!resumeId) continue

    const entry = stats.get(resumeId) ?? {
      applications: 0,
      atInterviewOrBeyond: 0,
      offers: 0,
      rejected: 0,
    }
    const count = group._count._all

    entry.applications += count
    if (group.status === "INTERVIEW" || group.status === "OFFER" || group.status === "ACCEPTED") {
      entry.atInterviewOrBeyond += count
    }
    if (group.status === "OFFER" || group.status === "ACCEPTED") entry.offers += count
    if (group.status === "REJECTED") entry.rejected += count

    stats.set(resumeId, entry)
  }

  return stats
}

export type ResumeProjectData = {
  name: string
  description?: string
  url?: string
}

export type NewResumeProjectData = ResumeProjectData & { resumeId: string }

/**
 * Replace a slot's skill tags. Null when the slot is not the caller's,
 * including when it does not exist, writing nothing in that case.
 */
export async function setSkills(
  userId: string,
  resumeId: string,
  skills: string[]
): Promise<Resume | null> {
  const { count } = await prisma.resume.updateMany({
    where: { id: resumeId, userId },
    data: { skills },
  })
  if (count === 0) return null
  return prisma.resume.findFirst({ where: { id: resumeId, userId } })
}

export function listProjects(userId: string, resumeId: string): Promise<ResumeProject[]> {
  return prisma.resumeProject.findMany({
    where: { userId, resumeId },
    // createdAt breaks a tie rather than leaving two equal positions to the
    // planner, which is free to return them in either order between queries.
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
}

export function findProjectById(userId: string, id: string): Promise<ResumeProject | null> {
  return prisma.resumeProject.findFirst({ where: { id, userId } })
}

/**
 * Append a project to a slot.
 *
 * `resumeId` is client-supplied and this write carries the caller's OWN
 * userId, so no `where: { userId }` clause anywhere can refuse a foreign slot.
 * `assertResumeOwned` in resume-service.ts is the control; it runs first.
 */
export async function createProject(
  userId: string,
  data: NewResumeProjectData
): Promise<ResumeProject> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.resumeProject.findFirst({
      where: { userId, resumeId: data.resumeId },
      orderBy: { position: "desc" },
      select: { position: true },
    })
    return tx.resumeProject.create({
      data: {
        userId,
        resumeId: data.resumeId,
        name: data.name,
        description: data.description ?? null,
        url: data.url ?? null,
        position: last ? last.position + 1 : 0,
      },
    })
  })
}

export async function updateProject(
  userId: string,
  id: string,
  data: ResumeProjectData
): Promise<ResumeProject | null> {
  // `?? null` on every optional field: Prisma reads `undefined` as "leave
  // unchanged", so a cleared description or url would silently never clear —
  // the same trap fixed in application-repository.ts.
  const { count } = await prisma.resumeProject.updateMany({
    where: { id, userId },
    data: {
      name: data.name,
      description: data.description ?? null,
      url: data.url ?? null,
    },
  })
  if (count === 0) return null
  return prisma.resumeProject.findFirst({ where: { id, userId } })
}

export async function removeProject(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.resumeProject.deleteMany({ where: { id, userId } })
  return count > 0
}

/**
 * Renumber a slot's projects to the given order, in one transaction.
 *
 * False — writing nothing — unless `projectIds` is exactly the set of projects
 * the caller owns on that slot: a partial list would leave stale positions, a
 * repeated id would collapse two projects onto one position, and a foreign id
 * is simply not theirs. All four refusals are the same answer.
 */
export async function reorderProjects(
  userId: string,
  resumeId: string,
  projectIds: string[]
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.resumeProject.findMany({
      where: { userId, resumeId },
      select: { id: true },
    })

    const owned = new Set(existing.map((project) => project.id))
    const requested = new Set(projectIds)
    if (requested.size !== projectIds.length) return false
    if (owned.size !== requested.size) return false
    if (!projectIds.every((id) => owned.has(id))) return false

    for (const [position, id] of projectIds.entries()) {
      await tx.resumeProject.updateMany({ where: { id, userId, resumeId }, data: { position } })
    }
    return true
  })
}

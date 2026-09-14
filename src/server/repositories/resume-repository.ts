import { prisma } from "@/lib/db/prisma"
import type {
  Application,
  ApplicationStatus,
  Company,
  Resume,
  ResumeProject,
  ResumeVersion,
} from "@prisma/client"
import { PIPELINE_STAGES, stageIndex } from "@/lib/status-order"
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

/**
 * Two classes of figure about one resume, and the whole point of the type is
 * that they are not the same number.
 *
 * The `atInterviewOrBeyond` / `offers` / `rejected` trio is CURRENT STATE:
 * where the applications stand right now. The `everReached*` pair is RECORDED
 * HISTORY: what they did on the way, read back out of ApplicationStatusEvent.
 * An application that interviewed and was then rejected is in `rejected` and
 * in `everReachedInterview`, and that gap is the reason this resume page
 * exists — it is the only place in the product where "the resume did its job"
 * and "the application did not work out" are visibly different claims.
 *
 * The field names carry the class, because a caller reading a bare number
 * cannot label it correctly: `atInterviewOrBeyond` renders as "Now at ...",
 * `everReachedInterview` as "Ever reached ..." — the same two words the
 * dashboard uses for the same two quantities.
 */
export type ResumeStats = {
  /** Applications that record a version of this resume. The denominator for
   *  the three current-state figures. */
  applications: number
  /** Current state. NOT a reached-stage count — see the comment above. */
  atInterviewOrBeyond: number
  /** Current state: sitting at OFFER or ACCEPTED right now. */
  offers: number
  /** Current state. */
  rejected: number
  /** Recorded: DISTINCT applications with a real move to interview or beyond,
   *  however they stand now. */
  everReachedInterview: number
  /** Recorded: DISTINCT applications with a real move to offer or beyond. */
  everReachedOffer: number
  /**
   * The denominator for the two above, and never `applications`: an
   * application whose only history is synthetic, or which predates recording
   * entirely, can never appear in a reached figure, so dividing by every
   * application would understate the resume by exactly the coverage gap.
   *
   * It is also the decision the UI needs: at 0 the `everReached*` pair must be
   * suppressed, not rendered as "0 ever reached interview". Before anything
   * was written down the honest answer is that nothing was watching, and a 0
   * asserts that nothing happened — the same rule as the dashboard's nullable
   * `everReachedInterview`, stated once here rather than by making both
   * recorded fields nullable.
   */
  recordedApplications: number
}

/** The zero row. Exported so every caller that needs a "no applications yet"
 *  placeholder gets the current field set rather than its own literal, which
 *  is how a stats object ends up missing a field added later. */
export function emptyResumeStats(): ResumeStats {
  return {
    applications: 0,
    atInterviewOrBeyond: 0,
    offers: 0,
    rejected: 0,
    everReachedInterview: 0,
    everReachedOffer: 0,
    recordedApplications: 0,
  }
}

/**
 * The stages that count as "at/reached X or beyond", as a set per threshold.
 *
 * Built from PIPELINE_STAGES, never from STATUS_ORDER: REJECTED sits LAST in
 * STATUS_ORDER, so a plain `stageIndex(s) >= start` over that array would file
 * every rejection under "offer or beyond" and report an offer rate above 100%.
 * It is where applications land, not a stage they pass through.
 *
 * One definition feeds both halves of ResumeStats on purpose. "Now at
 * interview or beyond" counts three statuses; if "ever reached interview"
 * counted only literal INTERVIEW events, an application that jumped straight
 * to OFFER would make the recorded number SMALLER than the current-state one,
 * and the pair the page is built to compare would be comparing two different
 * questions.
 */
function stagesAtOrBeyond(from: ApplicationStatus): Set<ApplicationStatus> {
  const start = stageIndex(from)
  return new Set(PIPELINE_STAGES.filter((stage) => stageIndex(stage) >= start))
}

const INTERVIEW_OR_BEYOND = stagesAtOrBeyond("INTERVIEW")
const OFFER_OR_BEYOND = stagesAtOrBeyond("OFFER")

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
 * §9 / §9.8 — the two classes of figure about one resume, side by side,
 * derived entirely from the existing pipeline. No new tracking tables.
 *
 * "At interview or beyond" is a CURRENT state: an application that interviewed
 * and was then rejected counts only in `rejected`. That undercount was the
 * whole of Phase 3's honesty caveat, and it is what the recorded half fixes —
 * `everReachedInterview` reads ApplicationStatusEvent and counts that
 * application, because the resume did get it an interview. The UI must keep
 * labelling the first "Now at" and the second "Ever reached"; they are
 * different claims and the gap between them is the point.
 *
 * Three queries, each with `userId` as a TOP-LEVEL filter. These are
 * aggregates, where a dropped scope is a plausible-looking wrong number rather
 * than a visible leak, so no relation clause carries the ownership check.
 *
 * The applications are fetched as rows rather than folded by a `groupBy`,
 * which is a deliberate reversal of the pattern elsewhere: the recorded half
 * has to join events to applications by id, so the id list is needed anyway
 * and a `groupBy` beside it would be a second round trip to Oregon computing
 * something already in memory.
 */
export async function statsByResume(userId: string): Promise<Map<string, ResumeStats>> {
  const [versions, linked, reached] = await Promise.all([
    prisma.resumeVersion.findMany({ where: { userId }, select: { id: true, resumeId: true } }),
    prisma.application.findMany({
      where: { userId, resumeVersionId: { not: null } },
      select: { id: true, status: true, resumeVersionId: true },
    }),
    // The shape analytics-repository.ts's `reachedCounts` fetches, for the
    // same reason: a `groupBy` here would count EVENTS, and an application
    // dragged Interview → Screening → Interview produced two of them while
    // reaching interview once — two interviews out of one application, which
    // is a rate above 100% as soon as anything divides by it.
    //
    // `distinct` on the pair collapses that repetition in Postgres rather than
    // shipping one row per drag back from Oregon; the fold below is what
    // makes the COUNT distinct, since the two are not the same guarantee —
    // distinct rows still carry one application at INTERVIEW *and* at OFFER.
    //
    // BACKFILL rows are excluded here rather than by the caller. A synthetic
    // row asserts only where an application stands now; reading it as evidence
    // of having *reached* that stage would hand every pre-recording resume a
    // free interview on the day this ships.
    prisma.applicationStatusEvent.findMany({
      where: { userId, source: { not: "BACKFILL" } },
      select: { applicationId: true, toStatus: true },
      distinct: ["applicationId", "toStatus"],
    }),
  ])

  const resumeIdByVersionId = new Map(versions.map((version) => [version.id, version.resumeId]))

  // Folded per application before anything is counted: one application that
  // reached INTERVIEW *and* OFFER has two distinct rows above, and both are
  // "interview or beyond". Incrementing per row would count it twice and
  // report more interviews than there are applications.
  const reachedByApplicationId = new Map<string, ApplicationStatus[]>()
  for (const event of reached) {
    const stages = reachedByApplicationId.get(event.applicationId)
    if (stages) stages.push(event.toStatus)
    else reachedByApplicationId.set(event.applicationId, [event.toStatus])
  }

  const stats = new Map<string, ResumeStats>()

  for (const application of linked) {
    if (!application.resumeVersionId) continue
    const resumeId = resumeIdByVersionId.get(application.resumeVersionId)
    // A version id the user does not own: another user's file, linked before
    // the service guard existed. It belongs to no resume of theirs — and
    // because the recorded half is folded inside this same loop, its history
    // is dropped with it rather than landing on a resume at random.
    if (!resumeId) continue

    const entry = stats.get(resumeId) ?? emptyResumeStats()
    stats.set(resumeId, entry)

    entry.applications += 1
    if (INTERVIEW_OR_BEYOND.has(application.status)) entry.atInterviewOrBeyond += 1
    if (OFFER_OR_BEYOND.has(application.status)) entry.offers += 1
    if (application.status === "REJECTED") entry.rejected += 1

    const stages = reachedByApplicationId.get(application.id)
    if (!stages) continue

    entry.recordedApplications += 1
    if (stages.some((stage) => INTERVIEW_OR_BEYOND.has(stage))) entry.everReachedInterview += 1
    if (stages.some((stage) => OFFER_OR_BEYOND.has(stage))) entry.everReachedOffer += 1
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

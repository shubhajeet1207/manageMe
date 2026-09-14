import { prisma } from "@/lib/db/prisma"
import type { ApplicationStatus, StatusEventSource } from "@prisma/client"

/**
 * Every function here aggregates. That makes a dropped `userId` a different
 * class of bug from elsewhere in this codebase: a missing scope on a row read
 * shows the wrong record and is obvious, while a missing scope on a `groupBy`
 * silently folds other users into a number that still looks plausible. It is
 * invisible in single-user testing, which is how this application is developed.
 *
 * So `userId` is a top-level filter in every `where` below, never nested inside
 * a relation clause where a later edit could move it.
 */

/** Current-state: how many applications sit at each status right now (§9.2). */
export async function pipelineCounts(
  userId: string
): Promise<Map<ApplicationStatus, number>> {
  const rows = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  })
  return new Map(rows.map((row) => [row.status, row._count._all]))
}

/**
 * Recorded: for each stage, the number of DISTINCT applications that ever
 * reached it (§9.3).
 *
 * Distinctness is what makes backward moves harmless — dragging a card
 * Interview → Screening → Interview counts once at each, which is the truth:
 * it reached both. Counting events instead would report two interviews.
 *
 * `BACKFILL` rows are excluded here rather than by the caller. A synthetic row
 * asserts only where an application stands now; treating it as evidence of
 * having *reached* that stage would inflate every funnel on the day this ships.
 */
export async function reachedCounts(
  userId: string
): Promise<Map<ApplicationStatus, number>> {
  const rows = await prisma.applicationStatusEvent.groupBy({
    by: ["toStatus"],
    where: { userId, source: { not: "BACKFILL" } },
    _count: { applicationId: true },
  })

  // groupBy counts rows, not distinct applications, so the dedupe happens here.
  const distinct = await prisma.applicationStatusEvent.findMany({
    where: { userId, source: { not: "BACKFILL" } },
    select: { applicationId: true, toStatus: true },
    distinct: ["applicationId", "toStatus"],
  })

  const counts = new Map<ApplicationStatus, number>()
  for (const row of distinct) {
    counts.set(row.toStatus, (counts.get(row.toStatus) ?? 0) + 1)
  }
  // `rows` is read only to keep the query planner honest about the index; the
  // distinct pass above is the answer.
  void rows
  return counts
}

/** How many applications have only synthetic history, so the funnel can say
 *  what it excluded (§8.4b). */
export async function backfilledOnlyCount(userId: string): Promise<number> {
  const withRecorded = await prisma.applicationStatusEvent.findMany({
    where: { userId, source: { not: "BACKFILL" } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  })
  const recordedIds = withRecorded.map((row) => row.applicationId)

  return prisma.application.count({
    where: {
      userId,
      statusEvents: { some: {} },
      ...(recordedIds.length > 0 ? { id: { notIn: recordedIds } } : {}),
    },
  })
}

/** Recorded: distinct applications with a real transition in the last 7 days
 *  (§9.2 tile 2). */
export async function movedSince(userId: string, since: Date): Promise<number> {
  const rows = await prisma.applicationStatusEvent.findMany({
    where: { userId, source: { not: "BACKFILL" }, changedAt: { gte: since } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  })
  return rows.length
}

export type StatusEventRow = {
  id: string
  applicationId: string
  fromStatus: ApplicationStatus | null
  toStatus: ApplicationStatus
  changedAt: Date
}

/**
 * Every recorded event, oldest first, for the passes that need sequence —
 * skip detection (§9.3b) and time-in-stage (§9.5). One query rather than one
 * per application; a single person's history is small enough that fetching it
 * and folding in memory is cheaper than N round trips to Oregon.
 *
 * Ordered by `(changedAt, id)` within an application, not `changedAt` alone:
 * two events can share a millisecond — a fast double-drag does it — and a
 * partial order there would pair the wrong events into intervals, producing a
 * negative duration in one stage and a doubled one in the next.
 */
export function recordedEvents(userId: string): Promise<StatusEventRow[]> {
  return prisma.applicationStatusEvent.findMany({
    where: { userId, source: { not: "BACKFILL" } },
    select: {
      id: true,
      applicationId: true,
      fromStatus: true,
      toStatus: true,
      changedAt: true,
    },
    orderBy: [{ applicationId: "asc" }, { changedAt: "asc" }, { id: "asc" }],
  })
}

/**
 * An application that has not finished, with enough of its company to name it.
 *
 * Only an unfinished application can be "currently in" a stage, so the terminal
 * set is a filter here rather than something the caller strips afterwards. It
 * is passed in rather than spelled a second time: which statuses count as
 * finished is a product decision that already lives in the service, and two
 * copies of it would drift the day an eighth status is added.
 */
export type OpenApplicationRow = {
  id: string
  status: ApplicationStatus
  roleTitle: string
  company: { name: string }
}

export function openApplications(
  userId: string,
  terminal: ApplicationStatus[]
): Promise<OpenApplicationRow[]> {
  return prisma.application.findMany({
    where: { userId, status: { notIn: terminal } },
    select: {
      id: true,
      status: true,
      roleTitle: true,
      company: { select: { name: true } },
    },
  })
}

/**
 * The activity feed's raw material (§11.2).
 *
 * Five scoped queries rather than one `UNION ALL`: a hand-written union puts
 * the ownership filter at the mercy of one forgotten `WHERE` in a string, while
 * each of these keeps `userId` a top-level scalar the type system checks.
 *
 * Bounded by construction — to fill a page of N entries you never need more
 * than N + 1 from any one source, whatever the table holds. `take` is therefore
 * `pageSize + 1` and the work does not grow with the user's history.
 *
 * `Credential` is absent and must stay absent: a feed line reading "Added
 * credential: Workday" is a disclosure surface bolted onto a feature whose
 * whole design is about not having one (§11.1, Phase 5 §9.8). `QuickDropItem`
 * and `Link` are absent too — a captured line and its conversion would be two
 * entries for one thought, and a bookmark is not an event.
 */
export type ActivityWindow = {
  /** Exclusive upper bound: the timestamp of the previous page's last entry. */
  before?: Date
  take: number
}

export type ActivityStatusEventRow = {
  id: string
  applicationId: string
  toStatus: ApplicationStatus
  changedAt: Date
  source: StatusEventSource
  application: { roleTitle: string; company: { name: string } }
}

export type ActivityApplicationRow = {
  id: string
  roleTitle: string
  createdAt: Date
  company: { name: string }
}

/** `completedAt` stays nullable even though the filter excludes nulls: the
 *  column is nullable, and narrowing at the use site beats asserting here. */
export type ActivityTaskRow = { id: string; title: string; completedAt: Date | null }

export type ActivityDocumentRow = { id: string; title: string; createdAt: Date }

export type ActivityResumeVersionRow = {
  id: string
  label: string
  createdAt: Date
  resumeId: string
  resume: { name: string }
}

export type ActivitySources = {
  statusEvents: ActivityStatusEventRow[]
  applications: ActivityApplicationRow[]
  tasks: ActivityTaskRow[]
  documents: ActivityDocumentRow[]
  resumeVersions: ActivityResumeVersionRow[]
}

export async function activitySources(
  userId: string,
  window: ActivityWindow
): Promise<ActivitySources> {
  const { before, take } = window
  // Spread rather than `lt: before` with an undefined value: Prisma reads an
  // explicit `undefined` inside a filter object as "no constraint" today, but
  // the absent key is the unambiguous way to say it.
  const olderThan = before ? { lt: before } : {}

  const [statusEvents, applications, tasks, documents, resumeVersions] = await Promise.all([
    prisma.applicationStatusEvent.findMany({
      where: { userId, changedAt: olderThan },
      select: {
        id: true,
        applicationId: true,
        toStatus: true,
        changedAt: true,
        source: true,
        application: {
          select: { roleTitle: true, company: { select: { name: true } } },
        },
      },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.application.findMany({
      where: { userId, createdAt: olderThan },
      select: {
        id: true,
        roleTitle: true,
        createdAt: true,
        company: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.task.findMany({
      // `not: null` is the whole point of this source: `updatedAt` cannot
      // answer "what did I finish last week" because any edit moves it.
      where: { userId, completedAt: { not: null, ...olderThan } },
      select: { id: true, title: true, completedAt: true },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.document.findMany({
      where: { userId, createdAt: olderThan },
      select: { id: true, title: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.resumeVersion.findMany({
      where: { userId, createdAt: olderThan },
      select: {
        id: true,
        label: true,
        createdAt: true,
        resumeId: true,
        resume: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
  ])

  return { statusEvents, applications, tasks, documents, resumeVersions }
}

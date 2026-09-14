import { prisma } from "@/lib/db/prisma"
import type { ApplicationStatus } from "@prisma/client"

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
 */
export function recordedEvents(userId: string): Promise<StatusEventRow[]> {
  return prisma.applicationStatusEvent.findMany({
    where: { userId, source: { not: "BACKFILL" } },
    select: { applicationId: true, fromStatus: true, toStatus: true, changedAt: true },
    orderBy: [{ applicationId: "asc" }, { changedAt: "asc" }],
  })
}

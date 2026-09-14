import { prisma } from "@/lib/db/prisma"
import type { ApplicationStatus, Company } from "@prisma/client"
import { PIPELINE_STAGES, stageIndex } from "@/lib/status-order"
import type { CreateCompanyInput } from "@/server/validators/company-schemas"

export type CompanyWithCount = Company & { _count: { applications: number } }

export function listByUser(userId: string): Promise<CompanyWithCount[]> {
  return prisma.company.findMany({
    where: { userId },
    include: { _count: { select: { applications: true } } },
    orderBy: { name: "asc" },
  })
}

export function findById(userId: string, id: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { id, userId } })
}

export function findByName(userId: string, name: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { userId, name } })
}

export function create(userId: string, data: CreateCompanyInput): Promise<Company> {
  return prisma.company.create({ data: { ...data, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateCompanyInput
): Promise<Company | null> {
  const { count } = await prisma.company.updateMany({ where: { id, userId }, data })
  if (count === 0) return null
  return prisma.company.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.company.deleteMany({ where: { id, userId } })
  return count > 0
}

export function countApplications(userId: string, id: string): Promise<number> {
  return prisma.application.count({ where: { userId, companyId: id } })
}

/**
 * The stages at or past a threshold, derived from the one ordering rather than
 * retyped, so reordering the pipeline cannot leave these figures behind.
 *
 * Filtered from PIPELINE_STAGES, never from STATUS_ORDER: REJECTED sits LAST
 * in STATUS_ORDER, so a plain `stageIndex(s) >= start` over that array would
 * file every rejection under "offer or better" and report more offers than
 * applications. It is where applications land, not a stage they pass through.
 *
 * The same list drives both classes of figure on purpose. "Now at interview or
 * better" spans three statuses; if "ever reached interview" counted only
 * literal INTERVIEW events, an application that jumped straight to OFFER would
 * make the recorded number SMALLER than the current-state one, and the pair the
 * UI puts side by side would be answering two different questions.
 */
function stagesAtOrBeyond(from: ApplicationStatus): ApplicationStatus[] {
  const start = stageIndex(from)
  return PIPELINE_STAGES.filter((stage) => stageIndex(stage) >= start)
}

const INTERVIEW_OR_BETTER = stagesAtOrBeyond("INTERVIEW")
const OFFER_OR_ACCEPTED = stagesAtOrBeyond("OFFER")

export type CompanyStats = {
  applications: number
  /**
   * Current state: how many applications sit at each status RIGHT NOW. Only
   * statuses with at least one application appear — callers zero-fill from
   * `STATUS_ORDER` so a missing key renders as 0 rather than as a gap.
   */
  byStatus: Map<ApplicationStatus, number>
  /** Current state. Not a reached-stage count: an application that interviewed
   *  and was then rejected is counted in `nowRejected` and nowhere else. */
  nowAtInterviewOrBetter: number
  /** Current state. */
  nowAtOfferOrAccepted: number
  /** Current state. */
  nowRejected: number
  /**
   * Recorded: DISTINCT applications with a real (non-BACKFILL) transition into
   * INTERVIEW or any later stage.
   *
   * Null — never 0 — when this company has no recorded history at all, because
   * before anything was written the honest answer is "nothing was watching",
   * and a 0 asserts that nothing ever reached interview. Same rule as the
   * dashboard's `everReachedInterview`.
   */
  everReachedInterview: number | null
  /** How many of this company's applications have ANY recorded (non-BACKFILL)
   *  history. It is what makes the null above decidable. */
  recordedApplications: number
  /**
   * The most recent write to any of this company's applications — a status
   * move, an edit, or the create. Null when the company has no applications.
   *
   * `Application.updatedAt` rather than `ApplicationStatusEvent.changedAt`: a
   * status write bumps the application row inside the same transaction that
   * appends the event, so updatedAt is the later-or-equal of the two and also
   * catches edits that changed no status. It deliberately ignores BACKFILL
   * rows, whose changedAt is a copy of updatedAt anyway.
   */
  lastActivityAt: Date | null
}

/** A company nobody has applied to yet. A factory rather than a shared frozen
 *  constant because `byStatus` is a Map: one shared instance would be mutated
 *  by whichever caller touched it first. */
export function emptyCompanyStats(): CompanyStats {
  return {
    applications: 0,
    byStatus: new Map(),
    nowAtInterviewOrBetter: 0,
    nowAtOfferOrAccepted: 0,
    nowRejected: 0,
    // Null, not 0, for the same reason as above: no applications means no
    // history, not a history in which nothing reached interview.
    everReachedInterview: null,
    recordedApplications: 0,
    lastActivityAt: null,
  }
}

/**
 * Per-company counts and recent activity, in three grouped queries folded to
 * company level in memory — the shape `resumeRepository.statsByResume` uses,
 * and for the same reason: rendering these numbers by fetching every
 * application row and filtering in JS is a full table read per page view.
 *
 * `userId` is a TOP-LEVEL filter in all three `where` clauses. On an aggregate
 * that is a different class of bug from a row read: a missing scope on a
 * `findFirst` shows a visibly wrong record, while a missing scope on a
 * `groupBy` folds another user's applications into a number that still looks
 * plausible, and stays invisible in single-user testing. The nested `userId`
 * inside `statusEvents.some` is belt-and-braces — the column is denormalised
 * onto the event precisely so this filter can exist.
 *
 * Returns a map keyed by company id; companies with no applications are absent
 * from it, so callers substitute `emptyCompanyStats()`.
 */
export async function statsByCompany(userId: string): Promise<Map<string, CompanyStats>> {
  const [currentRows, recordedRows, reachedRows] = await Promise.all([
    prisma.application.groupBy({
      by: ["companyId", "status"],
      where: { userId },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.application.groupBy({
      by: ["companyId"],
      where: {
        userId,
        statusEvents: { some: { userId, source: { not: "BACKFILL" } } },
      },
      _count: { _all: true },
    }),
    // Grouped over Application, NOT over ApplicationStatusEvent. An application
    // has exactly one row here, so the count is distinct by construction:
    // dragging a card Interview → Screening → Interview counts once, which is
    // the truth — it reached interview. Grouping the events would report two.
    prisma.application.groupBy({
      by: ["companyId"],
      where: {
        userId,
        statusEvents: {
          some: { userId, source: { not: "BACKFILL" }, toStatus: { in: INTERVIEW_OR_BETTER } },
        },
      },
      _count: { _all: true },
    }),
  ])

  const stats = new Map<string, CompanyStats>()
  const entryFor = (companyId: string): CompanyStats => {
    const existing = stats.get(companyId)
    if (existing) return existing
    const created = emptyCompanyStats()
    stats.set(companyId, created)
    return created
  }

  for (const row of currentRows) {
    const entry = entryFor(row.companyId)
    const count = row._count._all

    entry.applications += count
    // `set`, not an accumulate: (companyId, status) is the group key, so each
    // pair appears exactly once across `currentRows`.
    entry.byStatus.set(row.status, count)

    if (INTERVIEW_OR_BETTER.includes(row.status)) entry.nowAtInterviewOrBetter += count
    if (OFFER_OR_ACCEPTED.includes(row.status)) entry.nowAtOfferOrAccepted += count
    if (row.status === "REJECTED") entry.nowRejected += count

    const touched = row._max.updatedAt
    if (touched && (entry.lastActivityAt === null || touched > entry.lastActivityAt)) {
      entry.lastActivityAt = touched
    }
  }

  for (const row of recordedRows) {
    const entry = entryFor(row.companyId)
    entry.recordedApplications = row._count._all
    // There IS recorded history here, so 0 is now a real answer rather than an
    // absence. `reachedRows` below overwrites it when the company has one.
    entry.everReachedInterview = 0
  }

  for (const row of reachedRows) {
    entryFor(row.companyId).everReachedInterview = row._count._all
  }

  return stats
}

import * as analyticsRepository from "@/server/repositories/analytics-repository"
import { PIPELINE_STAGES, STATUS_ORDER, stageIndex } from "@/lib/status-order"
import type { ApplicationStatus } from "@prisma/client"

/**
 * Every figure this service returns carries its class (§9.1), because the
 * honesty is not decoration here — a reached-stage rate and a current-state
 * count are different claims about the same seven words, and the UI cannot
 * label them correctly if the service hands it bare numbers.
 */
export type MetricClass = "current-state" | "recorded" | "approximate"

export type StageCount = { status: ApplicationStatus; count: number }

export type Conversion = {
  from: ApplicationStatus
  to: ApplicationStatus
  /** Null when the denominator is zero — a rate from nothing is not 0%, it is
   *  unanswerable, and rendering "0%" asserts a failure that did not happen. */
  rate: number | null
  numerator: number
  denominator: number
}

export type FunnelReport = {
  reached: StageCount[]
  conversions: Conversion[]
  /** Distinct applications that ever reached REJECTED. Not a funnel stage. */
  closedRejected: number
  /** Applications whose history jumps a stage, so the funnel's empty rows are
   *  explained rather than read as broken data (§9.3b). */
  skippedStageCount: number
  /** Applications excluded because their only history is synthetic (§8.4b). */
  backfilledOnly: number
  /** True when there is no recorded history at all — the UI must say "nothing
   *  recorded yet" rather than render a funnel of zeroes. */
  empty: boolean
}

export type DashboardSummary = {
  tracked: number
  inPlay: number
  nowAtInterviewOrBetter: number
  everReachedInterview: number | null
  movedThisWeek: number | null
  pipeline: StageCount[]
}

const CLOSED: ApplicationStatus[] = ["ACCEPTED", "REJECTED"]

/** Zero-fills the stages `groupBy` omits — the one thing this can get wrong,
 *  and the reason it is a named test. */
function fill(
  counts: Map<ApplicationStatus, number>,
  stages: ApplicationStatus[]
): StageCount[] {
  return stages.map((status) => ({ status, count: counts.get(status) ?? 0 }))
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [pipeline, reached, moved] = await Promise.all([
    analyticsRepository.pipelineCounts(userId),
    analyticsRepository.reachedCounts(userId),
    analyticsRepository.movedSince(userId, weekAgo),
  ])

  const tracked = [...pipeline.values()].reduce((sum, n) => sum + n, 0)
  const inPlay = STATUS_ORDER.filter((s) => !CLOSED.includes(s)).reduce(
    (sum, s) => sum + (pipeline.get(s) ?? 0),
    0
  )
  const atInterviewIndex = stageIndex("INTERVIEW")
  const nowAtInterviewOrBetter = STATUS_ORDER.filter(
    (s) => s !== "REJECTED" && stageIndex(s) >= atInterviewIndex
  ).reduce((sum, s) => sum + (pipeline.get(s) ?? 0), 0)

  const hasRecorded = [...reached.values()].some((n) => n > 0)

  return {
    tracked,
    inPlay,
    nowAtInterviewOrBetter,
    // Null, not zero: before anything is recorded the honest answer is "nothing
    // was watching", and a 0 asserts that nothing happened.
    everReachedInterview: hasRecorded ? reachedAtOrBeyond(reached, "INTERVIEW") : null,
    movedThisWeek: hasRecorded ? moved : null,
    pipeline: fill(pipeline, STATUS_ORDER),
  }
}

/** Distinct applications that reached INTERVIEW or any later stage. An
 *  application that reached OFFER necessarily reached interview-or-better. */
function reachedAtOrBeyond(
  reached: Map<ApplicationStatus, number>,
  from: ApplicationStatus
): number {
  const start = stageIndex(from)
  return PIPELINE_STAGES.filter((s) => stageIndex(s) >= start).reduce(
    (max, s) => Math.max(max, reached.get(s) ?? 0),
    0
  )
}

export async function getFunnel(userId: string): Promise<FunnelReport> {
  const [reached, backfilledOnly, events] = await Promise.all([
    analyticsRepository.reachedCounts(userId),
    analyticsRepository.backfilledOnlyCount(userId),
    analyticsRepository.recordedEvents(userId),
  ])

  const reachedStages = fill(reached, PIPELINE_STAGES)

  const conversions: Conversion[] = []
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = PIPELINE_STAGES[i]
    const to = PIPELINE_STAGES[i + 1]
    const denominator = reached.get(from) ?? 0
    const numerator = reached.get(to) ?? 0
    conversions.push({
      from,
      to,
      numerator,
      denominator,
      rate: denominator === 0 ? null : numerator / denominator,
    })
  }

  return {
    reached: reachedStages,
    conversions,
    closedRejected: reached.get("REJECTED") ?? 0,
    skippedStageCount: countSkipped(events),
    backfilledOnly,
    empty: events.length === 0,
  }
}

/**
 * An application "skipped" when a transition moved more than one position
 * forward along STATUS_ORDER. Anything into REJECTED is excluded — leaving the
 * pipeline is legitimate from any stage, not a gap in the record.
 *
 * This exists so the funnel can explain its own empty rows. A user who drags
 * SAVED → INTERVIEW records neither APPLIED nor SCREENING, and without this
 * line they read "APPLIED = 0, INTERVIEW = 3" as broken software.
 */
function countSkipped(events: analyticsRepository.StatusEventRow[]): number {
  const skipped = new Set<string>()
  for (const event of events) {
    if (event.fromStatus === null) continue
    if (event.toStatus === "REJECTED") continue
    if (stageIndex(event.toStatus) - stageIndex(event.fromStatus) > 1) {
      skipped.add(event.applicationId)
    }
  }
  return skipped.size
}

/**
 * Below five closed intervals this page refuses to publish a median and shows
 * the raw sorted durations instead (§9.5). "67% of three" invites a reader to
 * treat it as stable, and a median over two numbers is an average wearing a
 * disguise — the observations themselves are both more honest and more
 * informative at that size.
 *
 * The stall check uses the same threshold: comparing an application's age to a
 * number this page will not print is exactly the invented threshold §9.5 rules
 * out.
 */
export const MIN_SAMPLE_FOR_MEDIAN = 5

/** The "Oldest in stage" list is a short list on purpose — a ranked list of
 *  everything open is the board, which the user already has. */
const OLDEST_LIMIT = 5

const DAY_MS = 24 * 60 * 60 * 1000

export type StageDuration = {
  status: ApplicationStatus
  /**
   * Median of the CLOSED intervals, in days. Null when there are none — not 0,
   * which would assert that applications pass through this stage instantly.
   *
   * Median rather than mean: one application that sat in Screening for four
   * months while the user was on holiday drags a mean and leaves a median
   * alone, and job-search durations are right-skewed by construction.
   */
  medianDays: number | null
  /** Always rendered beside the median. A median of one interval is not a
   *  median, and a figure whose n is hidden cannot be argued with. */
  n: number
  /** Every closed interval for the stage, ascending — what the page shows in
   *  place of a median below MIN_SAMPLE_FOR_MEDIAN. */
  durationsDays: number[]
}

/** The interval an open application is still inside: current-state, computed
 *  from its latest recorded event rather than from any duration statistic. */
export type OpenStageAge = {
  applicationId: string
  companyName: string
  roleTitle: string
  status: ApplicationStatus
  days: number
  /** The user's own median for this stage, or null when the stage has too few
   *  closed intervals to publish one. No threshold is invented; the comparison
   *  is only ever to the user's own distribution. */
  stageMedianDays: number | null
  stalled: boolean
}

export type VelocityReport = {
  stages: StageDuration[]
  /** Longest-running open intervals first, capped at OLDEST_LIMIT. */
  oldest: OpenStageAge[]
  stalledCount: number
  /**
   * Open applications left out of `oldest` because the instant they entered
   * their current stage was never recorded — their only history is synthetic,
   * or something wrote a status without recording it (§7.5). Reported rather
   * than dropped silently: an age measured from a backfilled `updatedAt` is a
   * wrong number, and a missing row is a smaller lie than a wrong one.
   */
  unmeasurableOpen: number
  empty: boolean
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS
}

/** Takes an already-sorted list. Even n averages the two middle values, which
 *  is the definition, not a rounding convenience. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The median this page is willing to PRINT, as opposed to the one it computed.
 *
 * Exported because the page needs the same answer and there must be exactly one
 * place that decides: `StageDuration.medianDays` is populated at every n, so a
 * component that rendered it directly would publish a "median" of two numbers
 * the day someone forgot the threshold — and it would look entirely plausible.
 */
export function publishedMedianDays(stage: StageDuration): number | null {
  return stage.n >= MIN_SAMPLE_FOR_MEDIAN ? stage.medianDays : null
}

/**
 * Time in stage, currently-in-stage age, and the stalls that fall out of
 * comparing the second to the first (§9.5).
 *
 * `recordedEvents` excludes `BACKFILL` at the query, so nothing here has to
 * remember to: a backfilled `changedAt` is the application's `updatedAt`, which
 * moves when a typo in a note is fixed. It is an upper bound on the last status
 * change with no lower bound and no information about any earlier stage, so
 * there is no arithmetic that turns it into a duration (§8.2 point 1).
 */
export async function getVelocity(userId: string): Promise<VelocityReport> {
  const [events, open] = await Promise.all([
    analyticsRepository.recordedEvents(userId),
    analyticsRepository.openApplications(userId, CLOSED),
  ])

  // The query returns events grouped by application and ascending within each,
  // so one pass builds every history without a sort.
  const history = new Map<string, analyticsRepository.StatusEventRow[]>()
  for (const event of events) {
    const rows = history.get(event.applicationId)
    if (rows) rows.push(event)
    else history.set(event.applicationId, [event])
  }

  const durations = new Map<ApplicationStatus, number[]>()
  for (const rows of history.values()) {
    // Stops one short of the end on purpose. The final event opens an interval
    // that is still running, and counting it would systematically under-report
    // every stage — an application still sitting in Interview has by definition
    // not finished being in Interview.
    for (let i = 0; i < rows.length - 1; i++) {
      const days = daysBetween(rows[i].changedAt, rows[i + 1].changedAt)
      const list = durations.get(rows[i].toStatus)
      if (list) list.push(days)
      else durations.set(rows[i].toStatus, [days])
    }
  }

  const stages: StageDuration[] = STATUS_ORDER.map((status) => {
    const sorted = (durations.get(status) ?? []).slice().sort((a, b) => a - b)
    return {
      status,
      medianDays: median(sorted),
      n: sorted.length,
      durationsDays: sorted,
    }
  })

  const publishedMedian = new Map<ApplicationStatus, number | null>(
    stages.map((stage) => [stage.status, publishedMedianDays(stage)])
  )

  const now = new Date()
  const ages: OpenStageAge[] = []
  let unmeasurableOpen = 0

  for (const application of open) {
    const rows = history.get(application.id)
    const latest = rows?.[rows.length - 1]
    // Two exclusions with one test, and both are §9.9's last bullet: an
    // application with no recorded event entered its stage at an unknown
    // instant, and one whose latest recorded event disagrees with its live
    // status entered its CURRENT stage off the record. Either way the age
    // would be measured from the wrong moment, so it is not shown at all.
    if (!latest || latest.toStatus !== application.status) {
      unmeasurableOpen += 1
      continue
    }
    const days = daysBetween(latest.changedAt, now)
    const stageMedianDays = publishedMedian.get(application.status) ?? null
    ages.push({
      applicationId: application.id,
      companyName: application.company.name,
      roleTitle: application.roleTitle,
      status: application.status,
      days,
      stageMedianDays,
      stalled: stageMedianDays !== null && days > stageMedianDays,
    })
  }

  ages.sort((a, b) => b.days - a.days)

  return {
    stages,
    oldest: ages.slice(0, OLDEST_LIMIT),
    stalledCount: ages.filter((age) => age.stalled).length,
    unmeasurableOpen,
    empty: ages.length === 0 && stages.every((stage) => stage.n === 0),
  }
}

/**
 * The instant on an activity entry, and what kind of instant it is.
 *
 * Carried per entry rather than per feed, because §9.1 classes this surface
 * "Mixed, per entry, marked": a recorded transition and a backfilled one are
 * rendered one line apart and a reader deciding whether to trust a date has to
 * be told what the date IS — the moment something happened, or the moment a row
 * was written.
 */
export type ActivitySource =
  | "STATUS_CHANGE"
  | "STATUS_BACKFILL"
  | "APPLICATION_ADDED"
  | "TASK_COMPLETED"
  | "DOCUMENT_FILED"
  | "RESUME_VERSION"

/**
 * How trustworthy this entry's timestamp is, per §9.1:
 *
 * - `recorded` — the instant the thing happened, written when it happened.
 *   A status transition's `changedAt`, a task's `completedAt`.
 * - `approximate` — a `BACKFILL` row, whose `changedAt` is the application's
 *   `updatedAt` at migration time. It moves when a typo in a note is fixed, so
 *   it is an upper bound on the last status change and nothing more (§8.2).
 * - `current-state` — an exact `createdAt`, but for the ROW, not the event.
 *   "Added Acme — Senior Engineer" is when the application was typed in, which
 *   is not when it was applied to.
 */
const SOURCE_CLASS: Record<ActivitySource, MetricClass> = {
  STATUS_CHANGE: "recorded",
  STATUS_BACKFILL: "approximate",
  APPLICATION_ADDED: "current-state",
  TASK_COMPLETED: "recorded",
  DOCUMENT_FILED: "current-state",
  RESUME_VERSION: "current-state",
}

/** Breaks a timestamp tie so the merge is a TOTAL order (§11.2). Without it two
 *  entries sharing a millisecond — which one backfill migration produces by the
 *  dozen — could swap places between two renders of the same page. */
const SOURCE_RANK: Record<ActivitySource, number> = {
  STATUS_CHANGE: 0,
  STATUS_BACKFILL: 1,
  APPLICATION_ADDED: 2,
  TASK_COMPLETED: 3,
  DOCUMENT_FILED: 4,
  RESUME_VERSION: 5,
}

export type ActivityEntry = {
  /**
   * `${source}:${id}`. The row id alone is not unique across the merged feed —
   * five tables generate ids independently — so this is what the list keys on
   * and what the de-duplication below compares.
   */
  key: string
  id: string
  source: ActivitySource
  metricClass: MetricClass
  at: Date
  /** Null on a backfilled entry, and that is the point: a synthetic row must
   *  never render with the "moved" verb a recorded one uses (§8.4c). */
  verb: string | null
  subject: string
  /** The stage this entry is about, on the two status sources only. The service
   *  hands back the enum rather than a label because `STATUS_LABELS` lives in a
   *  React module, and importing that here would pull the UI into the data
   *  layer for the sake of seven strings (the reason `lib/status-order.ts`
   *  exists at all). */
  status: ApplicationStatus | null
  href: string
}

export type ActivityPage = {
  entries: ActivityEntry[]
  /**
   * The instant to pass as the next page's `before`, or null at the end of the
   * feed. Null is the signal there is no further page — the caller must not
   * infer "more" from a full page, because a page that exactly exhausts the
   * feed is also full.
   */
  nextCursor: Date | null
}

/** The preview on /analytics (§11.3). The full feed's page is larger and is the
 *  caller's business, not a default. */
export const ACTIVITY_PREVIEW_SIZE = 20

function applicationSubject(row: { roleTitle: string; company: { name: string } }): string {
  return `${row.company.name} — ${row.roleTitle}`
}

/**
 * The merged, reverse-chronological feed (§11).
 *
 * `BACKFILL` rows are INCLUDED here — the one place in this phase where they
 * are. A timeline is a record of what is known, and a synthetic row is known;
 * it is marked `approximate` and stripped of the "moved" verb so it cannot be
 * read as a transition. Every aggregate elsewhere excludes it, because there a
 * wrong number is indistinguishable from a right one.
 */
export async function getActivity(
  userId: string,
  options: { before?: Date; pageSize?: number } = {}
): Promise<ActivityPage> {
  const pageSize = options.pageSize ?? ACTIVITY_PREVIEW_SIZE
  const sources = await analyticsRepository.activitySources(userId, {
    before: options.before,
    // N + 1 from each source is provably enough: an entry ranked N + 2 within
    // its own source cannot place in the top N of the merge, because the N + 1
    // entries above it in that source are all newer. So the work is bounded by
    // the page size and not by the size of the user's history.
    take: pageSize + 1,
  })

  const merged: ActivityEntry[] = [
    ...sources.statusEvents.map((row): ActivityEntry => {
      const source: ActivitySource =
        row.source === "BACKFILL" ? "STATUS_BACKFILL" : "STATUS_CHANGE"
      return {
        key: `${source}:${row.id}`,
        id: row.id,
        source,
        metricClass: SOURCE_CLASS[source],
        at: row.changedAt,
        verb: source === "STATUS_BACKFILL" ? null : "Moved",
        subject: applicationSubject(row.application),
        status: row.toStatus,
        // There is no per-application route in this app — the board is where an
        // application lives — so every application-scoped entry lands there.
        href: "/applications",
      }
    }),
    ...sources.applications.map((row): ActivityEntry => ({
      key: `APPLICATION_ADDED:${row.id}`,
      id: row.id,
      source: "APPLICATION_ADDED",
      metricClass: SOURCE_CLASS.APPLICATION_ADDED,
      at: row.createdAt,
      verb: "Added",
      subject: applicationSubject(row),
      status: null,
      href: "/applications",
    })),
    ...sources.tasks.flatMap((row): ActivityEntry[] =>
      // The query filters `completedAt: { not: null }`, but the column is
      // nullable and narrowing at the use site beats asserting at the query.
      row.completedAt === null
        ? []
        : [
            {
              key: `TASK_COMPLETED:${row.id}`,
              id: row.id,
              source: "TASK_COMPLETED",
              metricClass: SOURCE_CLASS.TASK_COMPLETED,
              at: row.completedAt,
              verb: "Completed",
              subject: row.title,
              status: null,
              href: "/tasks",
            },
          ]
    ),
    ...sources.documents.map((row): ActivityEntry => ({
      key: `DOCUMENT_FILED:${row.id}`,
      id: row.id,
      source: "DOCUMENT_FILED",
      metricClass: SOURCE_CLASS.DOCUMENT_FILED,
      at: row.createdAt,
      verb: "Filed",
      subject: row.title,
      status: null,
      href: `/documents/${row.id}`,
    })),
    ...sources.resumeVersions.map((row): ActivityEntry => ({
      key: `RESUME_VERSION:${row.id}`,
      id: row.id,
      source: "RESUME_VERSION",
      metricClass: SOURCE_CLASS.RESUME_VERSION,
      at: row.createdAt,
      verb: "Uploaded",
      subject: `${row.resume.name} — ${row.label}`,
      status: null,
      // The version detail lives on its resume's page; there is no route that
      // addresses a version on its own.
      href: `/resumes/${row.resumeId}`,
    })),
  ]

  merged.sort((a, b) => {
    const byTime = b.at.getTime() - a.at.getTime()
    if (byTime !== 0) return byTime
    const byRank = SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
    if (byRank !== 0) return byRank
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // Belt and braces on the composite key (§11.2). Five disjoint queries cannot
  // return the same key twice today; this is what keeps that true when a sixth
  // source is added, and it is O(n) on a list of at most 5 × (N + 1).
  const seen = new Set<string>()
  const entries: ActivityEntry[] = []
  for (const entry of merged) {
    if (seen.has(entry.key)) continue
    seen.add(entry.key)
    entries.push(entry)
  }

  const page = entries.slice(0, pageSize)
  return {
    entries: page,
    // Only when something was actually left behind. A page that exactly
    // exhausts the feed returns null, so the caller never renders an "Earlier"
    // link onto an empty page.
    nextCursor: entries.length > pageSize ? (page[page.length - 1]?.at ?? null) : null,
  }
}

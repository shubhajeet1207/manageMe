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

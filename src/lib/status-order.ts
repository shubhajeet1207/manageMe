import type { ApplicationStatus } from "@prisma/client"

/**
 * The pipeline order, in one framework-free place so the server can use it too.
 * It previously lived only in `components/status-badge.tsx`, which pulls in
 * React — importing that from a repository would drag the UI into the data
 * layer for the sake of an array.
 *
 * Order is meaning here, not presentation: §9.3's skip detection asks whether a
 * transition moved more than one position along this array, so a reordering
 * silently changes what "skipped a stage" means.
 */
export const STATUS_ORDER: ApplicationStatus[] = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]

/**
 * The funnel's six stages. `REJECTED` is excluded deliberately — it is where
 * applications land, not a stage they pass through (§9.3), which is the same
 * position the board takes by separating it behind a divider.
 */
export const PIPELINE_STAGES: ApplicationStatus[] = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
]

/** Position along `STATUS_ORDER`, used by the skip detector. */
export function stageIndex(status: ApplicationStatus): number {
  return STATUS_ORDER.indexOf(status)
}

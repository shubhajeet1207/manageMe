import { ApplicationStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const STATUS_ORDER: ApplicationStatus[] = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
}

// A job pipeline is a funnel, not a workflow: REJECTED is where applications
// land, not a stage they pass through. Everything that renders the pipeline
// reads these two maps, so the board rules, the badges and the dashboard
// summary all carry the same hue for the same stage.
export const STATUS_ACCENT: Record<ApplicationStatus, string> = {
  SAVED: "bg-stage-saved",
  APPLIED: "bg-stage-applied",
  SCREENING: "bg-stage-screening",
  INTERVIEW: "bg-stage-interview",
  OFFER: "bg-stage-offer",
  ACCEPTED: "bg-stage-accepted",
  REJECTED: "bg-stage-rejected",
}

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: "bg-slate-500/10 text-slate-700 dark:bg-slate-400/12 dark:text-slate-300",
  APPLIED: "bg-blue-600/10 text-blue-700 dark:bg-blue-400/14 dark:text-blue-300",
  SCREENING: "bg-violet-600/10 text-violet-700 dark:bg-violet-400/14 dark:text-violet-300",
  INTERVIEW: "bg-amber-500/16 text-amber-800 dark:bg-amber-400/14 dark:text-amber-300",
  OFFER: "bg-emerald-600/12 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-300",
  ACCEPTED: "bg-green-600/16 text-green-700 dark:bg-green-400/16 dark:text-green-300",
  REJECTED: "bg-rose-500/8 text-rose-700/80 dark:bg-rose-400/8 dark:text-rose-300/70",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASSES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}

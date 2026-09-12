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

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  APPLIED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  SCREENING: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  INTERVIEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  OFFER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ACCEPTED: "bg-green-600 text-white dark:bg-green-700",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

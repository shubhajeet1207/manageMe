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

// A status tag: a tint behind a dark text of the same hue (4.5:1+, measured in
// globals.css) so the board rules and these chips cannot drift apart.
const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: "bg-lozenge-saved text-lozenge-saved-fg",
  APPLIED: "bg-lozenge-applied text-lozenge-applied-fg",
  SCREENING: "bg-lozenge-screening text-lozenge-screening-fg",
  INTERVIEW: "bg-lozenge-interview text-lozenge-interview-fg",
  OFFER: "bg-lozenge-offer text-lozenge-offer-fg",
  ACCEPTED: "bg-lozenge-accepted text-lozenge-accepted-fg",
  REJECTED: "bg-lozenge-rejected text-lozenge-rejected-fg",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        // Typewriter caps with an edge in the tag's own colour. Uppercase is
        // CSS rather than data, so the accessible name stays "Interview".
        "rounded-none border-current/45 px-1.5 py-0 font-mono text-[10px] leading-4 font-bold tracking-[0.06em] uppercase",
        STATUS_CLASSES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}

import { ProjectStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["IDEA", "ACTIVE", "PAUSED", "DONE"]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  IDEA: "Idea",
  ACTIVE: "Active",
  PAUSED: "Paused",
  DONE: "Done",
}

// The same lozenge treatment the application pipeline uses, borrowing the ADS
// accent pairs already defined in globals.css so a project's state and an
// application's read as one system rather than two.
const PROJECT_STATUS_CLASSES: Record<ProjectStatus, string> = {
  IDEA: "bg-lozenge-saved text-lozenge-saved-fg",
  ACTIVE: "bg-lozenge-applied text-lozenge-applied-fg",
  PAUSED: "bg-lozenge-screening text-lozenge-screening-fg",
  DONE: "bg-lozenge-accepted text-lozenge-accepted-fg",
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-sm px-1.5 py-0 text-[11px] leading-4 font-bold tracking-[0.03em] uppercase",
        PROJECT_STATUS_CLASSES[status]
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Validated against the value list, never with `value in ProjectStatus`: `in`
 *  walks the prototype chain, so "toString" would pass as a status. */
export function parseProjectStatus(value: string | undefined): ProjectStatus | null {
  if (value && PROJECT_STATUS_ORDER.includes(value as ProjectStatus)) {
    return value as ProjectStatus
  }
  return null
}

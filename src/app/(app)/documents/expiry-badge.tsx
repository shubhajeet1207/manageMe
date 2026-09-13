import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { expiryState } from "./format"

/**
 * Computed at render time from the row and nothing else — there is no stored
 * state and there are no reminders (§6). Renders nothing at all when the date
 * is far enough out to be none of the reader's business.
 */
export function ExpiryBadge({ expiresOn, className }: { expiresOn: Date | null; className?: string }) {
  const state = expiryState(expiresOn)
  if (!state) return null

  return (
    <Badge
      variant="outline"
      className={cn(
        state.tone === "expired"
          ? "border-destructive/40 text-destructive"
          : "border-stage-offer/50 text-foreground",
        className
      )}
    >
      {state.label}
    </Badge>
  )
}

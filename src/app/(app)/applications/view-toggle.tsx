import Link from "next/link"
import { ApplicationStatus } from "@prisma/client"
import { cn } from "@/lib/utils"
import { applicationsHref, type ApplicationView } from "./search-params"

export function ViewToggle({
  view,
  status,
}: {
  view: ApplicationView
  status: ApplicationStatus | null
}) {
  const base = "px-3 py-1.5 text-sm rounded-md transition-colors"
  return (
    <nav aria-label="View" className="bg-muted inline-flex gap-1 rounded-lg p-1">
      <Link
        href={applicationsHref({ view: "board", status })}
        aria-current={view === "board" ? "page" : undefined}
        className={cn(base, view === "board" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Board
      </Link>
      <Link
        href={applicationsHref({ view: "table", status })}
        aria-current={view === "table" ? "page" : undefined}
        className={cn(base, view === "table" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Table
      </Link>
    </nav>
  )
}

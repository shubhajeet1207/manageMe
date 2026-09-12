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
  const base =
    "flex h-7 items-center rounded-[5px] px-2.5 text-[13px] font-medium transition-colors"
  const active = "bg-card text-foreground ring-border ring-1"
  const idle = "text-muted-foreground hover:text-foreground"

  return (
    <nav
      aria-label="View"
      className="bg-well border-border inline-flex h-9 items-center gap-1 rounded-md border p-1"
    >
      <Link
        href={applicationsHref({ view: "board", status })}
        aria-current={view === "board" ? "page" : undefined}
        className={cn(base, view === "board" ? active : idle)}
      >
        Board
      </Link>
      <Link
        href={applicationsHref({ view: "table", status })}
        aria-current={view === "table" ? "page" : undefined}
        className={cn(base, view === "table" ? active : idle)}
      >
        Table
      </Link>
    </nav>
  )
}

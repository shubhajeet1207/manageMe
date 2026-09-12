import Link from "next/link"
import { cn } from "@/lib/utils"

export function ViewToggle({ view }: { view: "board" | "table" }) {
  const base = "px-3 py-1.5 text-sm rounded-md transition-colors"
  return (
    <nav aria-label="View" className="bg-muted inline-flex gap-1 rounded-lg p-1">
      <Link
        href="/applications?view=board"
        aria-current={view === "board" ? "page" : undefined}
        className={cn(base, view === "board" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Board
      </Link>
      <Link
        href="/applications?view=table"
        aria-current={view === "table" ? "page" : undefined}
        className={cn(base, view === "table" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Table
      </Link>
    </nav>
  )
}

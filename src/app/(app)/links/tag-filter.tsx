import Link from "next/link"
import { cn } from "@/lib/utils"

/** The same chips the tag input stores, with the active one marked. A link
 *  rather than a button: a filtered list should survive a refresh and be
 *  shareable with yourself. */
export function TagFilter({ tags, active }: { tags: string[]; active: string | null }) {
  if (tags.length === 0) return null

  return (
    <nav aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
      <Link
        href="/links"
        aria-current={active ? undefined : "true"}
        className={cn(
          "border-card-border rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
          active ? "bg-well text-muted-foreground hover:text-foreground" : "bg-selected text-selected-foreground"
        )}
      >
        All
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/links?tag=${encodeURIComponent(tag)}`}
          aria-current={active === tag ? "true" : undefined}
          className={cn(
            "border-card-border rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            active === tag
              ? "bg-selected text-selected-foreground"
              : "bg-well text-muted-foreground hover:text-foreground"
          )}
        >
          {tag}
        </Link>
      ))}
    </nav>
  )
}

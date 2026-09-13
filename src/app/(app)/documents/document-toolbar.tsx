import Link from "next/link"
import { SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_SEARCH_QUERY_LENGTH } from "@/server/validators/document-schemas"
import { documentsHref, toggleTagHref, type DocumentFilters } from "./search-params"

/**
 * A plain GET form and plain links: no client component, no router push, and
 * **no debounced per-keystroke navigation**. Each keystroke would re-render a
 * Server Component page and round-trip the database, and the round trip is the
 * slow part at this volume. Enter is a decision; a debounce is a guess about
 * when the user finished typing.
 */
export function DocumentToolbar({
  filters,
  tagCounts,
}: {
  filters: DocumentFilters
  tagCounts: { tag: string; count: number }[]
}) {
  const hasFilters = filters.query !== "" || filters.tags.length > 0

  // Tags are deliberately not matched by the search box — substring-matching
  // inside a text array needs raw SQL, which is where `where: { userId }` stops
  // being mechanical. The gap is closed here instead, from the facet list that
  // is already loaded, with no extra query.
  const matchingTag = filters.query
    ? tagCounts.find(
        ({ tag }) =>
          tag.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase()) &&
          !filters.tags.some((active) => active.toLocaleLowerCase() === tag.toLocaleLowerCase())
      )
    : undefined

  return (
    <div className="space-y-3">
      <form method="get" action="/documents" className="flex flex-wrap items-start gap-2">
        {/* The active tags ride along as hidden inputs, so searching inside a
            filtered view narrows it rather than silently dropping the tags. */}
        {filters.tags.map((tag) => (
          <input key={tag} type="hidden" name="tag" value={tag} />
        ))}
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
          <Input
            type="search"
            name="q"
            defaultValue={filters.query}
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            aria-label="Search documents"
            aria-describedby="document-search-hint"
            placeholder="Search documents"
          />
          {/* A requirement, not a nicety: a search box that silently does not
              search contents will be read as broken the first time someone
              searches for a salary figure they know is in a PDF. */}
          <p id="document-search-hint" className="text-muted-foreground text-xs">
            Searches titles, tags and filenames — not what is inside your files.
          </p>
        </div>
        <Button type="submit" variant="outline">
          <SearchIcon className="size-3.5" />
          Search
        </Button>
        {hasFilters ? (
          <Button variant="ghost" asChild>
            <Link href={documentsHref({ query: "", tags: [] })}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {matchingTag ? (
        <p className="text-muted-foreground text-sm">
          <Link
            href={toggleTagHref(filters, matchingTag.tag)}
            className="text-foreground underline"
          >
            Filter by tag “{matchingTag.tag}”
          </Link>{" "}
          instead — the search box does not look inside tags.
        </p>
      ) : null}

      {tagCounts.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          {tagCounts.map(({ tag, count }) => {
            const active = filters.tags.some(
              (current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase()
            )
            return (
              <li key={tag}>
                <Link
                  href={toggleTagHref(filters, tag)}
                  aria-pressed={active}
                  className={
                    active
                      ? "bg-primary text-primary-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs leading-5 font-medium outline-none focus-visible:ring-2"
                      : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:bg-well focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 font-medium transition-colors outline-none focus-visible:ring-2"
                  }
                >
                  {tag}
                  <span className="tabular-nums opacity-70">{count}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

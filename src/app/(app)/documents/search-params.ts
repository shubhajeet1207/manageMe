import { stripControlChars } from "@/server/validators/limits"
import { dedupeTags } from "@/server/validators/tags"
import { MAX_DOCUMENT_TAGS, MAX_SEARCH_QUERY_LENGTH, MAX_TAG_LENGTH } from "@/server/validators/document-schemas"

/**
 * URL parameter parsing for the vault, following
 * `applications/search-params.ts` — including the lesson recorded there: a
 * search parameter is `string | string[] | undefined` depending on how many
 * times it appears, and code that assumes one shape breaks on the other.
 */

export type DocumentFilters = { query: string; tags: string[] }

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

// A NUL byte (or any other control character) is invalid in a Postgres
// `text` value and would 500 the page instead of simply matching nothing, so
// it is stripped here rather than left for the query to trip over: the
// filtered string behaves exactly like any other term or tag that doesn't
// match a row.
export function parseQuery(value: string | string[] | undefined): string {
  return stripControlChars(first(value)).trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/** Normalises both shapes, drops blanks and anything longer than a tag can be,
 *  dedupes case-insensitively and caps the list — so a hand-edited URL cannot
 *  push 500 terms into a query. */
export function parseTags(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const cleaned = raw
    .map((tag) => stripControlChars(tag).trim())
    .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
  return dedupeTags(cleaned).slice(0, MAX_DOCUMENT_TAGS)
}

/** Every control on the page builds its target through this, so changing one
 *  parameter can never drop the other. */
export function documentsHref({ query, tags }: DocumentFilters): string {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  for (const tag of tags) params.append("tag", tag)
  const search = params.toString()
  return search ? `/documents?${search}` : "/documents"
}

/** Toggling a tag keeps the query and every other tag exactly as they were. */
export function toggleTagHref(filters: DocumentFilters, tag: string): string {
  const lowered = tag.toLocaleLowerCase()
  const active = filters.tags.some((current) => current.toLocaleLowerCase() === lowered)
  return documentsHref({
    query: filters.query,
    tags: active
      ? filters.tags.filter((current) => current.toLocaleLowerCase() !== lowered)
      : [...filters.tags, tag].slice(0, MAX_DOCUMENT_TAGS),
  })
}

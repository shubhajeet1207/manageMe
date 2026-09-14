/**
 * What the applications table is allowed to sort by, and how a raw query
 * string becomes one of those.
 *
 * Framework-free and Prisma-free on purpose: the repository and the page
 * component both need the SAME answer, and putting it in either one would have
 * the other importing across a layer for the sake of an array — the reason
 * `status-order.ts` exists rather than the server reading the badge component.
 */

/**
 * THE ALLOWLIST. An array read with `.includes`, never an object read with
 * `in` or a bare index: both of those walk the prototype chain, so
 * `?sort=toString` resolves to `Function.prototype.toString` and arrives at the
 * query builder as a truthy "column". That is not hypothetical here —
 * `?status=toString` used to 500 this very page until `parseStatus`
 * (app/(app)/applications/search-params.ts) was changed to this same shape.
 */
export const APPLICATION_SORT_KEYS = ["company", "role", "status", "applied", "updated"] as const

export type ApplicationSortKey = (typeof APPLICATION_SORT_KEYS)[number]

export const SORT_DIRECTIONS = ["asc", "desc"] as const

export type SortDirection = (typeof SORT_DIRECTIONS)[number]

/** A sort that has been through `resolveApplicationSort`, so both halves are
 *  known-good and safe to `switch` on. */
export type ApplicationSort = {
  key: ApplicationSortKey
  direction: SortDirection
}

/**
 * A sort that has NOT been validated — two raw query-string values. Typed as
 * loose strings deliberately: every real caller is holding `searchParams`
 * output, and declaring the narrow union here would not make the value safe,
 * it would only move the lie to a cast at the call site.
 */
export type ApplicationSortInput = {
  key?: string
  direction?: string
}

/**
 * Unchanged from before sorting existed: most recently touched first. Every
 * caller that passes no sort gets exactly the query it used to get.
 */
export const DEFAULT_APPLICATION_SORT: ApplicationSort = { key: "updated", direction: "desc" }

/**
 * Which way a column points the FIRST time it is clicked. Dates open
 * descending because "which did I touch least recently" is nobody's opening
 * question; text and the pipeline open ascending because both read forwards,
 * and a status sort that opened on REJECTED would look broken.
 */
const NATURAL_DIRECTION: Record<ApplicationSortKey, SortDirection> = {
  company: "asc",
  role: "asc",
  status: "asc",
  applied: "desc",
  updated: "desc",
}

/** Safe to index: the key has already been through the allowlist. */
export function naturalDirectionFor(key: ApplicationSortKey): SortDirection {
  return NATURAL_DIRECTION[key]
}

function isSortKey(value: unknown): value is ApplicationSortKey {
  return APPLICATION_SORT_KEYS.includes(value as ApplicationSortKey)
}

function isDirection(value: unknown): value is SortDirection {
  return SORT_DIRECTIONS.includes(value as SortDirection)
}

/**
 * Query string in, safe sort out. Never throws and never returns a key the
 * repository has no case for: an unknown key means a mistyped or stale link,
 * and a stale link should render the default table, not a 500.
 *
 * `.includes` also disposes of `?sort=company&sort=role`, where Next hands the
 * page an array despite the `string` in the page's own searchParams type — an
 * array never equals a key, so it falls back like any other garbage.
 *
 * Idempotent, so an already-resolved sort can be handed straight back in: the
 * page resolves once to render its headers and passes the result to the
 * repository, which resolves again rather than trusting its caller.
 */
export function resolveApplicationSort(input: ApplicationSortInput | undefined): ApplicationSort {
  const key = input?.key
  if (!isSortKey(key)) return DEFAULT_APPLICATION_SORT

  const direction = input?.direction
  // A valid column with a junk direction keeps the column: the user asked for
  // "by company", and answering with "by updated" discards the half of the
  // request that was fine.
  return { key, direction: isDirection(direction) ? direction : naturalDirectionFor(key) }
}

/** True when a sort is the one a bare `/applications?view=table` already
 *  shows, which is how the link builder knows it can omit the parameters. */
export function isDefaultApplicationSort(sort: ApplicationSort): boolean {
  return (
    sort.key === DEFAULT_APPLICATION_SORT.key &&
    sort.direction === DEFAULT_APPLICATION_SORT.direction
  )
}

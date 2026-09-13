/**
 * Escape the characters Postgres `LIKE`/`ILIKE` treats as metacharacters.
 *
 * This is a correctness bug rather than an injection one — Prisma parameterises
 * the value, so there is no SQL injection here. But Prisma's `contains` does
 * NOT escape `%` and `_`, which are wildcards: searching for `50%` would match
 * documents containing "50" followed by anything, and a query of a single `%`
 * would match everything while appearing to filter. A query of many `%`
 * characters is also the one input that could make the scan expensive.
 *
 * Backslash first, and it has to be: escaping it after `%` has already become
 * `\%` would produce `\\%` — an escaped backslash followed by a live wildcard.
 * Backslash is PostgreSQL's default LIKE escape character with
 * `standard_conforming_strings` on.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

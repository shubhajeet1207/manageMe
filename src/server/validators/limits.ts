import { z } from "zod"

/**
 * Two numbers, stated once, so this phase stops inventing a new free-text cap
 * per field. SHORT is for a label's worth of context; LONG is for a field a
 * drafted follow-up email goes into.
 */
export const SHORT_TEXT_MAX = 500
export const LONG_TEXT_MAX = 2000

function optionalText(max: number) {
  // `.optional()` outermost — see company-schemas.ts.
  return z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((value) => (value === "" ? undefined : value))
    .optional()
}

export const optionalShortText = optionalText(SHORT_TEXT_MAX)
export const optionalLongText = optionalText(LONG_TEXT_MAX)

/** A select's "None" submits `""`, which must land as `undefined` so it clears
 *  through `?? null` rather than storing an empty string as a foreign key. */
export const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const CONTROL_CHARS = /[\x00-\x1F\x7F]/
const CONTROL_CHARS_GLOBAL = /[\x00-\x1F\x7F]/g

export function hasControlChars(value: string): boolean {
  return CONTROL_CHARS.test(value)
}

/** Postgres's `text` type refuses a NUL byte outright — not a non-match, a
 *  driver error — and every other control character is equally meaningless in
 *  an id or a search term. Stripping them here, before the value reaches a
 *  query, means a crafted one behaves like any other id or term that simply
 *  doesn't match: the ordinary 404 or empty-result page, never a 500. */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_GLOBAL, "")
}

/**
 * The shape every id-only delete/lookup schema should parse with: a plain
 * string (so a filter object like `{ not: "" }` fails here instead of
 * reaching Prisma's `where`, which is exactly what turned one delete into a
 * `deleteMany` in `documents/actions.ts`) that also cannot carry a NUL byte or
 * other control character through to the database.
 */
export const requiredId = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((value) => !hasControlChars(value), "Invalid id")

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

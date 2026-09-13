import { z } from "zod"

/**
 * The one place a URL is checked, because the alternative was five copies of
 * the same refinement and this codebase already shipped the hole once:
 * `z.string().url()` accepts `javascript:alert(1)`, which then flows straight
 * into an `<a href>`.
 *
 * The check is `new URL()` plus a protocol allowlist rather than Zod's `url()`
 * followed by a refinement. It is strictly stronger — a relative path and a
 * `javascript:` payload fail the same way — and it produces exactly ONE error
 * message, where a `.url().refine()` pair produces two for the same value
 * because Zod runs every check on a schema even after an earlier one fails.
 *
 * `.optional()` MUST stay the outermost wrapper on `optionalHttpUrl` — see the
 * note in company-schemas.ts. A `.transform()` applied after `.optional()`
 * hides the optional marker from Zod's key inference and yields a required key
 * typed `string | undefined`.
 */

const DEFAULT_MESSAGE = "Enter a valid URL"

/** True only for an absolute `http:`/`https:` URL. Used wherever free text is
 *  about to be rendered as an anchor — the same control as the schemas below,
 *  applied to a field no schema validated as a URL. */
export function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

/** A required URL. The check is not optional here either: a required URL field
 *  that accepts `javascript:` is the identical hole with fewer question marks. */
export function httpUrl(message: string = DEFAULT_MESSAGE) {
  return z
    .string()
    .trim()
    .refine((value) => isHttpUrl(value), { message })
}

export function optionalHttpUrl(message: string = DEFAULT_MESSAGE) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || isHttpUrl(value), { message })
    .transform((value) => (value === "" ? undefined : value))
    .optional()
}

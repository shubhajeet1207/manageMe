import { z } from "zod"

/**
 * Extracted from resume-schemas.ts's `skillList` + `dedupeSkills` because this
 * phase adds the second caller. Same behaviour, same reasoning.
 */

/**
 * Deduplicated case-insensitively — "React" and "react" are one tag, not two —
 * keeping the first spelling the user typed, because a tag list that silently
 * recases what was entered reads as a bug.
 */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const tag of tags) {
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(tag)
  }
  return kept
}

/** `noun` exists so the one shared implementation can keep saying "skills" on a
 *  resume and "tags" on a link. The wording is what the user reads; the rule is
 *  what this module owns. */
export function tagList({
  max,
  maxLength,
  noun = "tags",
}: {
  max: number
  maxLength: number
  noun?: string
}) {
  const singular = noun.endsWith("s") ? noun.slice(0, -1) : noun
  const capitalised = noun.charAt(0).toUpperCase() + noun.slice(1)

  return (
    z
      .array(
        z
          .string()
          .trim()
          .min(1, `${capitalised} cannot be blank`)
          .max(maxLength, `Each ${singular} must be ${maxLength} characters or less`)
      )
      .transform(dedupeTags)
      // Refined AFTER the dedupe so the cap counts what is stored: `max + 1`
      // entries of which two are the same tag is a `max`-tag list.
      .refine((tags) => tags.length <= max, `Add at most ${max} ${noun}`)
  )
}

import { z } from "zod"
import { optionalShortText, requiredId } from "@/server/validators/limits"
import { tagList } from "@/server/validators/tags"
import { httpUrl } from "@/server/validators/url"

// `.optional()` MUST be the outermost wrapper on every optional field — see the
// note in company-schemas.ts.

export const MAX_LINK_TAGS = 10
export const MAX_LINK_TAG_LENGTH = 30

const linkFields = {
  // Required, and refined for protocol like every optional URL in the app: a
  // required URL field that accepts `javascript:` is the identical hole with
  // fewer question marks.
  url: httpUrl(),
  // Required. A list of bare URLs is a list the user cannot scan. The create
  // form pre-fills this from the URL's host as a client convenience; the server
  // has no such default and rejects a blank title.
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalShortText,
  tags: tagList({ max: MAX_LINK_TAGS, maxLength: MAX_LINK_TAG_LENGTH }).default([]),
}

export const createLinkSchema = z.object(linkFields)
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const updateLinkSchema = z.object({ id: z.string().min(1), ...linkFields })
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>

export const linkIdSchema = z.object({ id: requiredId })

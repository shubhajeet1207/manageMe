import { z } from "zod"
import { DOCUMENT_CONTENT_TYPES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/server/files/content-types"
import { tagList } from "@/server/validators/tags"

export const MAX_DOCUMENT_TITLE_LENGTH = 200
export const MAX_DOCUMENT_DESCRIPTION_LENGTH = 2000
export const MAX_DOCUMENT_TAGS = 20
export const MAX_TAG_LENGTH = 30
export const MAX_SEARCH_QUERY_LENGTH = 100

/** The `accept` attribute for the upload input, built from the registry so the
 *  picker and the server cannot list different types. */
export const DOCUMENT_ACCEPT = DOCUMENT_CONTENT_TYPES.map((spec) => spec.contentType).join(",")

/** One message for every way the allow-list can be missed, because the user
 *  does not need to know whether we rejected the header or the bytes. */
export const UNSUPPORTED_FILE_MESSAGE = "Upload a PDF, PNG, JPEG or WebP file"

// `.optional()` MUST be the outermost wrapper — see the note in
// company-schemas.ts. Applying `.transform()` after `.optional()` hides the
// optional marker from Zod's key inference, producing a required key typed
// `string | undefined`. This has bitten the project twice.
const optionalText = z
  .string()
  .trim()
  .max(MAX_DOCUMENT_DESCRIPTION_LENGTH)
  .transform((value) => (value === "" ? undefined : value))
  .optional()

// A select's "None" submits "", which must land as `undefined` so the service
// clears it through `?? null` rather than storing "" as a foreign key.
const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()

// The empty-string branch is tried BEFORE coercion, exactly as
// application-schemas' optionalSalary does: `z.coerce.date()` turns "" into an
// Invalid Date, which then saves as one.
//
// No past/future refinement: unlike Application.appliedAt, an expiry can
// legitimately be either — a passport that expired last year is exactly the
// document someone needs to be reminded about.
const optionalDate = z.coerce
  .date()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const documentFields = {
  title: z.string().trim().min(1, "Title is required").max(MAX_DOCUMENT_TITLE_LENGTH),
  description: optionalText,
  tags: tagList({ max: MAX_DOCUMENT_TAGS, maxLength: MAX_TAG_LENGTH }),
  // Client-supplied and guarded by assertCompanyOwned in the service (§5.1b),
  // never by repository scoping: the row being written is the caller's own, so
  // every `where: { userId }` clause on it still matches.
  companyId: optionalId,
  expiresOn: optionalDate,
}

// `z.instanceof(File)` works on both sides: `File` is a global in the browser
// and in Node >= 20, so the client resolver and the Server Action share one
// schema, as every other form in the app does.
//
// The signature check is deliberately NOT here — it needs the bytes. The action
// runs this schema, reads the bytes, then calls the service, which calls
// `validateUpload` and maps a failure to a field error on `file`.
export const createDocumentSchema = z.object({
  ...documentFields,
  file: z
    .instanceof(File, { message: "Choose a file" })
    .refine((file) => file.size > 0, "Choose a file")
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, `This file is larger than ${MAX_UPLOAD_MB}MB`)
    .refine(
      (file) => DOCUMENT_CONTENT_TYPES.some((spec) => spec.contentType === file.type),
      UNSUPPORTED_FILE_MESSAGE
    ),
})
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>

// No `file`: the bytes are immutable (§7). Accepting one here would be a second
// write path to guard and a version system by the back door.
export const updateDocumentSchema = z.object({
  id: z.string().min(1),
  ...documentFields,
})
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>

export const documentSearchSchema = z.object({
  query: z.string().trim().max(MAX_SEARCH_QUERY_LENGTH).optional(),
  tags: z
    .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
    .max(MAX_DOCUMENT_TAGS)
    .default([]),
})
export type DocumentSearchInput = z.infer<typeof documentSearchSchema>

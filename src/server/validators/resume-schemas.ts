import { z } from "zod"
import { MAX_UPLOAD_BYTES, PDF_CONTENT_TYPE } from "@/server/files/pdf"

// `.optional()` MUST be the outermost wrapper — see the note in
// company-schemas.ts. Applying `.transform()` after `.optional()` hides the
// optional marker from Zod's key inference, producing `notes: string | undefined`
// (a required key) instead of `notes?: string`, which breaks every caller that
// omits the field. This has bitten the project twice.
const optionalNotes = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? undefined : value))
  .optional()

export const createResumeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  notes: optionalNotes,
})
export type CreateResumeInput = z.infer<typeof createResumeSchema>

export const updateResumeSchema = createResumeSchema.extend({
  id: z.string().min(1),
})
export type UpdateResumeInput = z.infer<typeof updateResumeSchema>

// `z.instanceof(File)` works on both sides: `File` is a global in the browser
// and in Node >= 20, so the client resolver and the Server Action share one
// schema, as every other form in the app does.
//
// The magic-byte check is deliberately NOT here — it needs the bytes.
// `validatePdfUpload` in src/server/files/pdf.ts owns that; the action runs
// this schema, reads the bytes, then runs the byte check and maps its failure
// to a field error on `file` like any other.
export const uploadResumeVersionSchema = z.object({
  resumeId: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(100),
  file: z
    .instanceof(File, { message: "Choose a file" })
    .refine((file) => file.size > 0, "Choose a file")
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, "This file is larger than 10MB")
    .refine((file) => file.type === PDF_CONTENT_TYPE, "Only PDF files are supported"),
})
export type UploadResumeVersionInput = z.infer<typeof uploadResumeVersionSchema>

export const setCurrentVersionSchema = z.object({
  resumeId: z.string().min(1),
  versionId: z.string().min(1),
})
export type SetCurrentVersionInput = z.infer<typeof setCurrentVersionSchema>

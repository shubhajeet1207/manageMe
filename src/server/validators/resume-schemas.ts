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

export const MAX_RESUME_SKILLS = 50
export const MAX_SKILL_LENGTH = 50
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2000

/**
 * Deduplicated case-insensitively — "React" and "react" are one tag, not two —
 * keeping the first spelling the user typed, because a tag list that silently
 * recases what was entered reads as a bug.
 */
function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const skill of skills) {
    const key = skill.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(skill)
  }
  return kept
}

// The cap is refined AFTER the dedupe transform so it counts what is stored:
// 51 entries of which two are the same tag is a 50-skill resume.
const skillList = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Skills cannot be blank")
      .max(MAX_SKILL_LENGTH, `Each skill must be ${MAX_SKILL_LENGTH} characters or less`)
  )
  .transform(dedupeSkills)
  .refine(
    (skills) => skills.length <= MAX_RESUME_SKILLS,
    `Add at most ${MAX_RESUME_SKILLS} skills`
  )

export const setResumeSkillsSchema = z.object({
  resumeId: z.string().min(1),
  skills: skillList,
})
export type SetResumeSkillsInput = z.infer<typeof setResumeSkillsSchema>

const optionalDescription = z
  .string()
  .trim()
  .max(MAX_PROJECT_DESCRIPTION_LENGTH)
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  // `url()` alone accepts any scheme, including `javascript:`/`data:`, which
  // would otherwise flow straight into an `<a href>`. Zod runs every check on
  // a schema even after an earlier one fails, so guard against `new URL()`
  // throwing on a value `.url()` has already rejected.
  .refine(
    (value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol)
      } catch {
        return false
      }
    },
    { message: "Enter a valid URL" }
  )
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const resumeProjectFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  description: optionalDescription,
  url: optionalUrl,
}

export const createResumeProjectSchema = z.object({
  resumeId: z.string().min(1),
  ...resumeProjectFields,
})
export type CreateResumeProjectInput = z.infer<typeof createResumeProjectSchema>

// No `resumeId`: a project cannot be moved between slots, and accepting one
// here would be a second client-supplied id to guard.
export const updateResumeProjectSchema = z.object({
  id: z.string().min(1),
  ...resumeProjectFields,
})
export type UpdateResumeProjectInput = z.infer<typeof updateResumeProjectSchema>

export const reorderResumeProjectsSchema = z.object({
  resumeId: z.string().min(1),
  projectIds: z.array(z.string().min(1)).min(1),
})
export type ReorderResumeProjectsInput = z.infer<typeof reorderResumeProjectsSchema>

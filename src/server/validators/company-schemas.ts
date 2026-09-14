import { z } from "zod"
import { LONG_TEXT_MAX, requiredId } from "@/server/validators/limits"
import { optionalHttpUrl } from "@/server/validators/url"

// `.optional()` MUST be the outermost wrapper. Applying `.transform()` after
// `.optional()` hides the optional marker from Zod's key inference, producing
// `website: string | undefined` (a required key) instead of `website?: string`,
// which breaks every caller that omits the field.
//
// The cap is LONG_TEXT_MAX and must stay identical to the identically-named
// `optionalText` in application-schemas.ts. The two had drifted — 500 here
// against 2000 there — so the same paragraph of notes saved against an
// application and was refused against the company it was about. They are two
// helpers only because each file predates limits.ts; the number is one
// decision, so it is read from one constant rather than retyped. Do not
// "helpfully" split them again.
const optionalText = z
  .string()
  .trim()
  .max(LONG_TEXT_MAX)
  .transform((value) => (value === "" ? undefined : value))
  .optional()

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: optionalHttpUrl(),
  location: optionalText,
  notes: optionalText,
})
export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const updateCompanySchema = createCompanySchema.extend({
  id: z.string().min(1),
})
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>

export const companyIdSchema = z.object({ id: requiredId })
export type CompanyIdInput = z.infer<typeof companyIdSchema>

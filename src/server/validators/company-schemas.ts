import { z } from "zod"

// `.optional()` MUST be the outermost wrapper. Applying `.transform()` after
// `.optional()` hides the optional marker from Zod's key inference, producing
// `website: string | undefined` (a required key) instead of `website?: string`,
// which breaks every caller that omits the field.
const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))
  .optional()

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: optionalUrl,
  location: optionalText,
  notes: optionalText,
})
export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const updateCompanySchema = createCompanySchema.extend({
  id: z.string().min(1),
})
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>

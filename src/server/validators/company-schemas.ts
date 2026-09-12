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

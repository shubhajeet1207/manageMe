import { z } from "zod"

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value === "" ? undefined : value))

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))

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

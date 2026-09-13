import { z } from "zod"
import { ApplicationStatus, WorkMode } from "@prisma/client"

// `.optional()` MUST be the outermost wrapper on every field below — see the
// note in company-schemas.ts. Transform-after-optional yields required keys.
const optionalText = z
  .string()
  .trim()
  .max(2000)
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

// The empty-string branch must be tried BEFORE coercion: `z.coerce.number()`
// turns "" into 0, so a blank salary field would silently save as 0 rather
// than staying empty.
const optionalSalary = z
  .union([z.literal(""), z.coerce.number().int().min(0, "Salary cannot be negative")])
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const optionalPastDate = z.coerce
  .date()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))
  .optional()

const applicationFields = z.object({
  companyId: z.string().min(1, "Company is required"),
  roleTitle: z.string().trim().min(1, "Role title is required").max(200),
  status: z.enum(ApplicationStatus).default("SAVED"),
  jobUrl: optionalUrl,
  location: optionalText,
  workMode: z
    .enum(WorkMode)
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  salaryMin: optionalSalary,
  salaryMax: optionalSalary,
  currency: z
    .string()
    .trim()
    .max(10)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  source: optionalText,
  appliedAt: optionalPastDate,
  notes: optionalText,
  // Which FILE was sent, so the value is a version id, not a resume id. It is
  // client-supplied and the repository's `userId` scoping cannot vouch for it:
  // `assertResumeVersionOwned` in application-service.ts does, on create and on
  // update. "None" submits "" and must land as undefined, never as "".
  resumeVersionId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
})

// Cross-field rules are written out on each exported schema rather than
// through a generic wrapper: a helper generic over `z.ZodTypeAny` erases the
// inferred object shape, so the refine callbacks below would not typecheck.
export const createApplicationSchema = applicationFields
  .refine(
    (value) =>
      value.salaryMin === undefined ||
      value.salaryMax === undefined ||
      value.salaryMax >= value.salaryMin,
    {
      message: "Maximum salary must be greater than or equal to minimum",
      path: ["salaryMax"],
    }
  )
  .refine(
    (value) => value.appliedAt === undefined || value.appliedAt.getTime() <= Date.now(),
    { message: "Applied date cannot be in the future", path: ["appliedAt"] }
  )
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>

export const updateApplicationSchema = applicationFields
  .extend({ id: z.string().min(1) })
  .refine(
    (value) =>
      value.salaryMin === undefined ||
      value.salaryMax === undefined ||
      value.salaryMax >= value.salaryMin,
    {
      message: "Maximum salary must be greater than or equal to minimum",
      path: ["salaryMax"],
    }
  )
  .refine(
    (value) => value.appliedAt === undefined || value.appliedAt.getTime() <= Date.now(),
    { message: "Applied date cannot be in the future", path: ["appliedAt"] }
  )
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>

export const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ApplicationStatus),
})
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>

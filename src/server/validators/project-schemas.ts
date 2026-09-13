import { z } from "zod"
import { ProjectStatus } from "@prisma/client"
import { optionalLongText } from "@/server/validators/limits"
import { optionalHttpUrl } from "@/server/validators/url"

// `.optional()` MUST be the outermost wrapper on every optional field — see the
// note in company-schemas.ts. A `.transform()` applied after `.optional()` hides
// the optional marker from Zod's key inference and yields a required key typed
// `T | undefined`. This has bitten the project twice.

const projectFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  // A project note is where a plan goes, so LONG rather than SHORT.
  description: optionalLongText,
  status: z.enum(ProjectStatus).default("ACTIVE"),
  url: optionalHttpUrl(),
}

export const createProjectSchema = z.object(projectFields)
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z.object({ id: z.string().min(1), ...projectFields })
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const projectIdSchema = z.object({ id: z.string().min(1) })

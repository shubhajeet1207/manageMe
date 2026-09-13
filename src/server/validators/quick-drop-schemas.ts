import { z } from "zod"
import { LONG_TEXT_MAX } from "@/server/validators/limits"
import { createLinkSchema } from "@/server/validators/link-schemas"
import { createProjectSchema } from "@/server/validators/project-schemas"
import { createTaskSchema } from "@/server/validators/task-schemas"

/**
 * One field. No title, no kind, no type — whether an item is a URL is computed
 * from its content by `isHttpUrl`, and a stored classification is a second
 * source of truth for a derived fact.
 */
export const createQuickDropSchema = z.object({
  content: z.string().trim().min(1, "Type or paste something").max(LONG_TEXT_MAX),
})
export type CreateQuickDropInput = z.infer<typeof createQuickDropSchema>

export const quickDropIdSchema = z.object({ id: z.string().min(1) })
export type QuickDropIdInput = z.infer<typeof quickDropIdSchema>

// Each triage carries the item id alongside the normal payload, so the service
// can create the target row and delete the inbox row in one transaction.
export const triageToTaskSchema = createTaskSchema.extend({
  quickDropItemId: z.string().min(1),
})
export type TriageToTaskInput = z.infer<typeof triageToTaskSchema>

export const triageToLinkSchema = createLinkSchema.extend({
  quickDropItemId: z.string().min(1),
})
export type TriageToLinkInput = z.infer<typeof triageToLinkSchema>

export const triageToProjectSchema = createProjectSchema.extend({
  quickDropItemId: z.string().min(1),
})
export type TriageToProjectInput = z.infer<typeof triageToProjectSchema>

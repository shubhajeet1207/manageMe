import { z } from "zod"
import { TaskStatus } from "@prisma/client"
import { optionalId, optionalLongText, requiredId } from "@/server/validators/limits"

// `.optional()` MUST be the outermost wrapper on every optional field — see the
// note in company-schemas.ts.

/**
 * A due date is a DAY, not an instant (§7.5). `<input type="date">` submits
 * `YYYY-MM-DD`, and this parses that string explicitly rather than leaning on
 * `z.coerce.date()`, so the value's interpretation is written down instead of
 * inherited from a JS parsing rule.
 *
 * The regex alone is not enough: `2026-02-31` matches it and produces an
 * Invalid Date, and `2026-13-01` rolls over silently in some engines. The
 * round-trip check is what makes a well-shaped impossible date fail.
 *
 * One refine rather than a `.or(z.literal(""))` union, because a union reports
 * a branch failure as "Invalid input" and the user reading the form needs the
 * one message that names what is wrong.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const optionalDueDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isCalendarDate(value), "Enter a valid date")
  .transform((value) => (value === "" ? undefined : new Date(`${value}T00:00:00.000Z`)))
  .optional()

// `completedAt` appears in no schema and no action accepts it: it is owned by
// the service, which sets it when a task becomes DONE and clears it when the
// task leaves. `updatedAt` cannot answer "what did I finish last week" because
// any edit moves it.
const taskFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  // A task note is where a drafted follow-up email goes, so LONG.
  notes: optionalLongText,
  status: z.enum(TaskStatus).default("TODO"),
  dueDate: optionalDueDate,
  // Client-supplied foreign ids. The repository's `userId` scoping cannot vouch
  // for either: `assertProjectOwned` and `assertApplicationOwned` do, on create
  // and on update, in task-service.ts.
  projectId: optionalId,
  applicationId: optionalId,
}

export const createTaskSchema = z.object(taskFields)
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z.object({ id: z.string().min(1), ...taskFields })
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/** The inline capture at the top of /tasks and on a project: a title, and the
 *  owner the surface already knows. Everything else takes its default. */
export const quickAddTaskSchema = z.object({
  title: taskFields.title,
  projectId: optionalId,
  applicationId: optionalId,
})
export type QuickAddTaskInput = z.infer<typeof quickAddTaskSchema>

/** The row checkbox. A two-state control cannot restore a three-state field, so
 *  unchecking returns the task to TODO rather than to IN_PROGRESS (§8.3). */
export const setTaskDoneSchema = z.object({
  id: z.string().min(1),
  done: z.boolean(),
})
export type SetTaskDoneInput = z.infer<typeof setTaskDoneSchema>

export const taskIdSchema = z.object({ id: requiredId })

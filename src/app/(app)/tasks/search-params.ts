import { TaskStatus } from "@prisma/client"
import type { TaskFilters } from "@/server/repositories/task-repository"
import { stripControlChars } from "@/server/validators/limits"

export const TASK_STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
}

/**
 * Validated against the actual value list, never with `value in TaskStatus`:
 * `in` walks the prototype chain, so "toString" and "constructor" pass as if
 * they were real statuses. The applications table shipped that hole and it
 * became a 500 the moment a later feature indexed with the result.
 */
export function parseTaskStatus(value: string | undefined): TaskStatus | null {
  if (value && TASK_STATUS_ORDER.includes(value as TaskStatus)) return value as TaskStatus
  return null
}

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// These filters go straight into an equality match in the repository, and a
// NUL byte or other control character is invalid in a Postgres `text` value
// there too: it would 500 rather than simply match nothing.
function id(value: string | string[] | undefined): string | undefined {
  const trimmed = stripControlChars(first(value) ?? "").trim()
  return trimmed ? trimmed : undefined
}

/**
 * An absent status is the default list, which is every task that is not DONE —
 * completed work is reachable at `?status=DONE` and nowhere else. The filters
 * go straight into the repository, so an unknown value must not survive here.
 */
export function parseTaskFilters(params: RawParams): TaskFilters {
  const status = parseTaskStatus(first(params.status))
  const projectId = id(params.project)
  const applicationId = id(params.application)

  return {
    ...(status ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    ...(applicationId ? { applicationId } : {}),
  }
}

/** Every control on the page builds its target through this, so changing one
 *  filter can never drop another. */
export function tasksHref(filters: TaskFilters): string {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.projectId) params.set("project", filters.projectId)
  if (filters.applicationId) params.set("application", filters.applicationId)

  const query = params.toString()
  return query ? `/tasks?${query}` : "/tasks"
}

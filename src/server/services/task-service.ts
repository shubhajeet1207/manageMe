import * as taskRepository from "@/server/repositories/task-repository"
import type { TaskFilters, TaskWithContext, TaskWriteData } from "@/server/repositories/task-repository"
import { assertApplicationOwned } from "@/server/services/application-service"
import { assertProjectOwned } from "@/server/services/project-service"
import type { CreateTaskInput, QuickAddTaskInput } from "@/server/validators/task-schemas"
import type { Task } from "@prisma/client"

export class TaskNotFoundError extends Error {
  constructor() {
    super("Task not found")
  }
}

/**
 * Both guards, on every path that stores a client-supplied foreign id — create,
 * update, quick-add and QuickDrop triage. Skipped when an id is undefined,
 * because unlinking is always allowed; run BEFORE the write, so a refused id
 * costs nothing and leaves nothing behind.
 */
export async function assertTaskLinksOwned(
  userId: string,
  input: { projectId?: string; applicationId?: string }
): Promise<void> {
  if (input.projectId !== undefined) await assertProjectOwned(userId, input.projectId)
  if (input.applicationId !== undefined) await assertApplicationOwned(userId, input.applicationId)
}

/**
 * `completedAt` is decided here and nowhere else: it is in no Zod schema and no
 * action accepts it. It is stamped when a task arrives at DONE and cleared when
 * it leaves, and an edit to a task that was already DONE leaves the original
 * timestamp alone — otherwise "what did I finish last week" would move every
 * time a note was corrected, which is the reason `updatedAt` could not answer it.
 */
function completedAtFor(status: Task["status"], existing: Task | null): Date | null {
  if (status !== "DONE") return null
  if (existing?.status === "DONE" && existing.completedAt) return existing.completedAt
  return new Date()
}

export function toTaskWriteData(input: CreateTaskInput, existing: Task | null): TaskWriteData {
  return { ...input, completedAt: completedAtFor(input.status, existing) }
}

export function listTasks(userId: string, filters: TaskFilters): Promise<TaskWithContext[]> {
  return taskRepository.listByUser(userId, filters)
}

/** How many completed tasks the default list is hiding, in this same
 *  project/application context — the filter bar's "N done" link. */
export function countDoneTasks(
  userId: string,
  filters: Pick<TaskFilters, "projectId" | "applicationId">
): Promise<number> {
  return taskRepository.countDone(userId, filters)
}

export async function getTask(userId: string, id: string): Promise<TaskWithContext> {
  const task = await taskRepository.findById(userId, id)
  if (!task) throw new TaskNotFoundError()
  return task
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  await assertTaskLinksOwned(userId, input)
  return taskRepository.create(userId, toTaskWriteData(input, null))
}

/** The inline capture at the top of /tasks and on a project detail page: a
 *  title, and the owner the surface already knows. */
export async function quickAddTask(userId: string, input: QuickAddTaskInput): Promise<Task> {
  return createTask(userId, { ...input, status: "TODO" })
}

export async function updateTask(
  userId: string,
  id: string,
  input: CreateTaskInput
): Promise<Task> {
  const existing = await taskRepository.findById(userId, id)
  if (!existing) throw new TaskNotFoundError()

  await assertTaskLinksOwned(userId, input)

  const updated = await taskRepository.update(userId, id, toTaskWriteData(input, existing))
  if (!updated) throw new TaskNotFoundError()
  return updated
}

export async function setTaskDone(userId: string, id: string, done: boolean): Promise<Task> {
  const updated = await taskRepository.setDone(userId, id, done)
  if (!updated) throw new TaskNotFoundError()
  return updated
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const deleted = await taskRepository.remove(userId, id)
  if (!deleted) throw new TaskNotFoundError()
}

/** One grouped query for the whole applications table (§7.3), not one per row. */
export function countOpenTasksByApplication(userId: string): Promise<Map<string, number>> {
  return taskRepository.countOpenByApplication(userId)
}

/** What the application delete dialog names before it happens: the tasks are
 *  unlinked, not deleted (§7.4). */
export function countApplicationTasks(userId: string, applicationId: string): Promise<number> {
  return taskRepository.countByApplication(userId, applicationId)
}

export function countTasksByApplication(userId: string): Promise<Map<string, number>> {
  return taskRepository.countAllByApplication(userId)
}

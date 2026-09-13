import * as projectRepository from "@/server/repositories/project-repository"
import * as quickDropRepository from "@/server/repositories/quick-drop-repository"
import { ProjectNameTakenError } from "@/server/services/project-service"
import { assertTaskLinksOwned, toTaskWriteData } from "@/server/services/task-service"
import type {
  CreateQuickDropInput,
  TriageToLinkInput,
  TriageToProjectInput,
  TriageToTaskInput,
} from "@/server/validators/quick-drop-schemas"
import type { Link, Project, QuickDropItem, Task } from "@prisma/client"

export class QuickDropItemNotFoundError extends Error {
  constructor() {
    super("That item is no longer in your inbox")
  }
}

export function listQuickDropItems(userId: string): Promise<QuickDropItem[]> {
  return quickDropRepository.listByUser(userId)
}

export function countQuickDropItems(userId: string): Promise<number> {
  return quickDropRepository.countByUser(userId)
}

export function captureQuickDropItem(
  userId: string,
  input: CreateQuickDropInput
): Promise<QuickDropItem> {
  return quickDropRepository.create(userId, input)
}

export async function dismissQuickDropItem(userId: string, id: string): Promise<void> {
  const deleted = await quickDropRepository.remove(userId, id)
  if (!deleted) throw new QuickDropItemNotFoundError()
}

/**
 * The create and the delete are one transaction inside the repository, so a
 * failed create leaves the capture in the inbox rather than losing it. The
 * guards run BEFORE the transaction opens: a triage carrying someone else's
 * project must not even reach the delete half.
 */
export async function triageQuickDropToTask(
  userId: string,
  input: TriageToTaskInput
): Promise<Task> {
  const { quickDropItemId, ...data } = input
  await assertTaskLinksOwned(userId, data)

  const task = await quickDropRepository.convertToTask(
    userId,
    quickDropItemId,
    toTaskWriteData(data, null)
  )
  if (!task) throw new QuickDropItemNotFoundError()
  return task
}

export async function triageQuickDropToLink(
  userId: string,
  input: TriageToLinkInput
): Promise<Link> {
  const { quickDropItemId, ...data } = input

  const link = await quickDropRepository.convertToLink(userId, quickDropItemId, data)
  if (!link) throw new QuickDropItemNotFoundError()
  return link
}

export async function triageQuickDropToProject(
  userId: string,
  input: TriageToProjectInput
): Promise<Project> {
  const { quickDropItemId, ...data } = input

  // Checked before the transaction opens so the clash is a field error on the
  // name rather than a generic failure. The unique constraint is still the
  // backstop, and the repository's transaction is what keeps the capture when
  // it fires.
  if (await projectRepository.findByName(userId, data.name)) throw new ProjectNameTakenError()

  const project = await quickDropRepository.convertToProject(userId, quickDropItemId, data)
  if (!project) throw new QuickDropItemNotFoundError()
  return project
}

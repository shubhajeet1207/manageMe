import * as projectRepository from "@/server/repositories/project-repository"
import type { ProjectWithOpenTasks } from "@/server/repositories/project-repository"
import type { CreateProjectInput } from "@/server/validators/project-schemas"
import type { Project, ProjectStatus } from "@prisma/client"

export class ProjectNameTakenError extends Error {
  constructor() {
    super("You already have a project with this name")
  }
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found")
  }
}

/** Deliberately says "Project not found": a not-yours answer and a not-there
 *  answer are the same answer (§12.2). */
export class ProjectNotOwnedError extends Error {
  constructor() {
    super("Project not found")
    this.name = "ProjectNotOwnedError"
  }
}

/**
 * The cross-entity guard for every write that carries a client-supplied
 * `projectId` — Task is the only caller today.
 *
 * Repository scoping cannot catch this: the task being written is the caller's
 * OWN, carrying the caller's own `userId`, so every `where: { userId }` clause
 * on the write matches and the foreign id rides along unchecked.
 *
 * Called on create and on update, and skipped when the id is undefined, because
 * unlinking is always allowed.
 */
export async function assertProjectOwned(userId: string, projectId: string): Promise<void> {
  const project = await projectRepository.findById(userId, projectId)
  if (!project) throw new ProjectNotOwnedError()
}

export function listProjects(
  userId: string,
  status?: ProjectStatus
): Promise<ProjectWithOpenTasks[]> {
  return projectRepository.listByUser(userId, status)
}

export async function getProject(userId: string, id: string): Promise<Project> {
  const project = await projectRepository.findById(userId, id)
  if (!project) throw new ProjectNotFoundError()
  return project
}

export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<Project> {
  const existing = await projectRepository.findByName(userId, input.name)
  if (existing) throw new ProjectNameTakenError()
  return projectRepository.create(userId, input)
}

export async function updateProject(
  userId: string,
  id: string,
  input: CreateProjectInput
): Promise<Project> {
  const clash = await projectRepository.findByName(userId, input.name)
  if (clash && clash.id !== id) throw new ProjectNameTakenError()

  const updated = await projectRepository.update(userId, id, input)
  if (!updated) throw new ProjectNotFoundError()
  return updated
}

/** What the delete dialog names before it happens: the tasks are unlinked, not
 *  deleted (§7.4), and a zero-task project gets the plain message. */
export function countProjectTasks(userId: string, id: string): Promise<number> {
  return projectRepository.countTasks(userId, id)
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const deleted = await projectRepository.remove(userId, id)
  if (!deleted) throw new ProjectNotFoundError()
}

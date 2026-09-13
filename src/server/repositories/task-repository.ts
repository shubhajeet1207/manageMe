import { prisma } from "@/lib/db/prisma"
import type { Application, Company, Project, Task, TaskStatus } from "@prisma/client"
import type { CreateTaskInput } from "@/server/validators/task-schemas"

/** `completedAt` is not in any Zod schema and no action accepts it: the service
 *  decides it and hands it here, so the repository stays Prisma queries and
 *  nothing else. */
export type TaskWriteData = Omit<CreateTaskInput, "id"> & { completedAt: Date | null }

export type TaskWithContext = Task & {
  project: Pick<Project, "id" | "name"> | null
  application: (Application & { company: Company }) | null
}

export type TaskFilters = {
  status?: TaskStatus
  projectId?: string
  applicationId?: string
}

const CONTEXT_INCLUDE = {
  project: { select: { id: true, name: true } },
  application: { include: { company: true } },
} as const

/**
 * Ascending due date with nulls last, which is already exactly the bucket order
 * the client renders headers into (§7.5) — the client adds to the tree rather
 * than reordering it, so there is no hydration mismatch to have.
 *
 * Completed tasks are excluded unless `status` asks for them: the default list
 * is the work still to do.
 */
export function listByUser(userId: string, filters: TaskFilters): Promise<TaskWithContext[]> {
  return prisma.task.findMany({
    where: {
      userId,
      status: filters.status ?? { not: "DONE" },
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.applicationId ? { applicationId: filters.applicationId } : {}),
    },
    include: CONTEXT_INCLUDE,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  })
}

export function findById(userId: string, id: string): Promise<TaskWithContext | null> {
  return prisma.task.findFirst({ where: { id, userId }, include: CONTEXT_INCLUDE })
}

export function create(userId: string, data: TaskWriteData): Promise<Task> {
  return prisma.task.create({
    data: {
      userId,
      title: data.title,
      status: data.status,
      notes: data.notes ?? null,
      dueDate: data.dueDate ?? null,
      projectId: data.projectId ?? null,
      applicationId: data.applicationId ?? null,
      completedAt: data.completedAt,
    },
  })
}

export async function update(
  userId: string,
  id: string,
  data: TaskWriteData
): Promise<Task | null> {
  // `?? null` on every optional field: Prisma reads `undefined` as "leave
  // unchanged", so clearing a note, a due date, a project or an application
  // would be a silent no-op. Same trap as application-repository.ts.
  const { count } = await prisma.task.updateMany({
    where: { id, userId },
    data: {
      title: data.title,
      status: data.status,
      notes: data.notes ?? null,
      dueDate: data.dueDate ?? null,
      projectId: data.projectId ?? null,
      applicationId: data.applicationId ?? null,
      completedAt: data.completedAt,
    },
  })
  if (count === 0) return null
  return prisma.task.findFirst({ where: { id, userId } })
}

export async function setDone(userId: string, id: string, done: boolean): Promise<Task | null> {
  const { count } = await prisma.task.updateMany({
    where: { id, userId },
    data: done
      ? { status: "DONE", completedAt: new Date() }
      : { status: "TODO", completedAt: null },
  })
  if (count === 0) return null
  return prisma.task.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } })
  return count > 0
}

export function countByProject(userId: string, projectId: string): Promise<number> {
  return prisma.task.count({ where: { userId, projectId } })
}

export function countByApplication(userId: string, applicationId: string): Promise<number> {
  return prisma.task.count({ where: { userId, applicationId } })
}

/** One grouped query for the whole applications table, not one per row. */
export function countOpenByApplication(userId: string): Promise<Map<string, number>> {
  return groupByApplication(userId, true)
}

/** Every task, open or finished: what the delete dialog names, because all of
 *  them are unlinked and none of them is deleted (§7.4). */
export function countAllByApplication(userId: string): Promise<Map<string, number>> {
  return groupByApplication(userId, false)
}

async function groupByApplication(
  userId: string,
  openOnly: boolean
): Promise<Map<string, number>> {
  const rows = await prisma.task.groupBy({
    by: ["applicationId"],
    where: {
      userId,
      applicationId: { not: null },
      ...(openOnly ? { status: { not: "DONE" as const } } : {}),
    },
    _count: { _all: true },
  })

  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.applicationId) counts.set(row.applicationId, row._count._all)
  }
  return counts
}

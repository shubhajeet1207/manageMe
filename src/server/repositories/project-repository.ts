import { prisma } from "@/lib/db/prisma"
import type { Project, ProjectStatus } from "@prisma/client"
import type { CreateProjectInput } from "@/server/validators/project-schemas"

export type ProjectWithOpenTasks = Project & { openTaskCount: number; taskCount: number }

export async function listByUser(
  userId: string,
  status?: ProjectStatus
): Promise<ProjectWithOpenTasks[]> {
  const projects = await prisma.project.findMany({
    where: { userId, ...(status ? { status } : {}) },
    // A filtered relation count rather than a count per row: the list renders
    // open tasks, and `_count: { tasks: true }` would include finished ones.
    include: { _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } },
    orderBy: { updatedAt: "desc" },
  })

  // The delete dialog names how many tasks move to No project, which is ALL of
  // them and not just the open ones. One grouped query for the whole page
  // rather than a count per row.
  const totals = await prisma.task.groupBy({
    by: ["projectId"],
    where: { userId, projectId: { not: null } },
    _count: { _all: true },
  })
  const totalByProject = new Map(
    totals.flatMap((row) => (row.projectId ? [[row.projectId, row._count._all] as const] : []))
  )

  return projects.map(({ _count, ...project }) => ({
    ...project,
    openTaskCount: _count.tasks,
    taskCount: totalByProject.get(project.id) ?? 0,
  }))
}

export function findById(userId: string, id: string): Promise<Project | null> {
  return prisma.project.findFirst({ where: { id, userId } })
}

export function findByName(userId: string, name: string): Promise<Project | null> {
  return prisma.project.findFirst({ where: { userId, name } })
}

export function create(userId: string, data: CreateProjectInput): Promise<Project> {
  return prisma.project.create({
    data: {
      userId,
      name: data.name,
      status: data.status,
      description: data.description ?? null,
      url: data.url ?? null,
    },
  })
}

export async function update(
  userId: string,
  id: string,
  data: CreateProjectInput
): Promise<Project | null> {
  // `?? null` on every optional field: Prisma reads `undefined` as "leave
  // unchanged", so clearing a description or a url would be a silent no-op —
  // the write succeeds, the UI says saved, and the old value is still there.
  // Same trap as application-repository.ts and resume-repository.ts.
  const { count } = await prisma.project.updateMany({
    where: { id, userId },
    data: {
      name: data.name,
      status: data.status,
      description: data.description ?? null,
      url: data.url ?? null,
    },
  })
  if (count === 0) return null
  return prisma.project.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  // `Task.project` is `onDelete: SetNull`, so the tasks survive and are
  // unlinked. Deleting something a task points at never deletes the task.
  const { count } = await prisma.project.deleteMany({ where: { id, userId } })
  return count > 0
}

export function countTasks(userId: string, id: string): Promise<number> {
  return prisma.task.count({ where: { userId, projectId: id } })
}

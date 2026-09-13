import { prisma } from "@/lib/db/prisma"
import type { Link, Project, QuickDropItem, Task } from "@prisma/client"
import type { CreateLinkInput } from "@/server/validators/link-schemas"
import type { CreateProjectInput } from "@/server/validators/project-schemas"
import type { CreateQuickDropInput } from "@/server/validators/quick-drop-schemas"
import type { TaskWriteData } from "@/server/repositories/task-repository"

// There is no update path here at all: an inbox item is created, converted or
// dismissed, never edited (§8.5).

export function listByUser(userId: string): Promise<QuickDropItem[]> {
  return prisma.quickDropItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
}

export function findById(userId: string, id: string): Promise<QuickDropItem | null> {
  return prisma.quickDropItem.findFirst({ where: { id, userId } })
}

export function countByUser(userId: string): Promise<number> {
  return prisma.quickDropItem.count({ where: { userId } })
}

export function create(userId: string, data: CreateQuickDropInput): Promise<QuickDropItem> {
  return prisma.quickDropItem.create({ data: { userId, content: data.content } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.quickDropItem.deleteMany({ where: { id, userId } })
  return count > 0
}

/**
 * The three conversions, each a create and a delete in ONE transaction, so a
 * failed create leaves the item in the inbox rather than losing the capture.
 *
 * The delete is `deleteMany({ where: { id, userId } })` and needs no
 * cross-entity guard: it only ever addresses the caller's own row, and the
 * worst a forged id can do is match nothing — which is the `null` return. The
 * CREATE half is what carries client-supplied foreign ids, and task-service.ts
 * guards those before calling in here.
 */
async function convert<T>(
  userId: string,
  quickDropItemId: string,
  write: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.quickDropItem.deleteMany({
      where: { id: quickDropItemId, userId },
    })
    if (count === 0) return null
    return write(tx)
  })
}

export function convertToTask(
  userId: string,
  quickDropItemId: string,
  data: TaskWriteData
): Promise<Task | null> {
  return convert(userId, quickDropItemId, (tx) =>
    tx.task.create({
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
  )
}

export function convertToLink(
  userId: string,
  quickDropItemId: string,
  data: CreateLinkInput
): Promise<Link | null> {
  return convert(userId, quickDropItemId, (tx) =>
    tx.link.create({
      data: {
        userId,
        url: data.url,
        title: data.title,
        description: data.description ?? null,
        tags: data.tags,
      },
    })
  )
}

export function convertToProject(
  userId: string,
  quickDropItemId: string,
  data: CreateProjectInput
): Promise<Project | null> {
  return convert(userId, quickDropItemId, (tx) =>
    tx.project.create({
      data: {
        userId,
        name: data.name,
        status: data.status,
        description: data.description ?? null,
        url: data.url ?? null,
      },
    })
  )
}

import { prisma } from "@/lib/db/prisma"
import { Prisma, ApplicationStatus, ProjectStatus, TaskStatus } from "@prisma/client"
import { pageQuery, pageResult, type PageInput } from "@/server/pagination"
import { escapeLikePattern } from "./like-pattern"
import { observe, actorHash } from "@/lib/observability/logger"

/** Each collection page has a stable createdAt/id cursor and a database deadline. */
function bounded<T>(userId: string, operation: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return observe(operation, () => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'")
    return work(tx)
  }, { maxWait: 3000, timeout: 8000 }), { actor: actorHash(userId) })
}

function textMatch(q: string) { return { contains: escapeLikePattern(q), mode: "insensitive" as const } }
function enumValue<T extends Record<string, string>>(values: T, input?: string): T[keyof T] | undefined {
  if (!input) return undefined
  if (!Object.values(values).includes(input)) throw new Error("Invalid status filter")
  return input as T[keyof T]
}

export function listApplicationsPage(userId: string, input: PageInput = {}) {
  const scope = `applications:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.ApplicationWhereInput = { userId, companyId: p.companyId, status: enumValue(ApplicationStatus, p.status), ...(p.q ? { OR: [{ roleTitle: textMatch(p.q) }, { company: { name: textMatch(p.q) } }, { location: textMatch(p.q) }] } : {}) }
  return bounded(userId, "applications.page", async (tx) => {
    const [rows, total] = await Promise.all([
      tx.application.findMany({ where: { AND: [where, p.afterWhere] }, include: { company: true }, take: p.take, orderBy: p.orderBy }),
      tx.application.count({ where }),
    ])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listDocumentsPage(userId: string, input: PageInput = {}) {
  const scope = `documents:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.DocumentWhereInput = { userId, companyId: p.companyId, ...(p.tag ? { tags: { has: p.tag } } : {}), ...(p.q ? { OR: [{ title: textMatch(p.q) }, { description: textMatch(p.q) }, { originalFilename: textMatch(p.q) }] } : {}) }
  return bounded(userId, "documents.page", async (tx) => {
    const [rows, total] = await Promise.all([
      tx.document.findMany({ where: { AND: [where, p.afterWhere] }, include: { company: { select: { id: true, name: true } } }, take: p.take, orderBy: p.orderBy }),
      tx.document.count({ where }),
    ])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listTasksPage(userId: string, input: PageInput = {}) {
  const scope = `tasks:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.TaskWhereInput = { userId, projectId: p.projectId, applicationId: p.applicationId, status: enumValue(TaskStatus, p.status) ?? { not: "DONE" }, ...(p.q ? { title: textMatch(p.q) } : {}) }
  return bounded(userId, "tasks.page", async (tx) => {
    const [rows, total] = await Promise.all([
      tx.task.findMany({ where: { AND: [where, p.afterWhere] }, include: { project: { select: { id: true, name: true } }, application: { include: { company: true } } }, take: p.take, orderBy: p.orderBy }),
      tx.task.count({ where }),
    ])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listLinksPage(userId: string, input: PageInput = {}) {
  const scope = `links:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.LinkWhereInput = { userId, ...(p.tag ? { tags: { has: p.tag } } : {}), ...(p.q ? { OR: [{ title: textMatch(p.q) }, { description: textMatch(p.q) }, { url: textMatch(p.q) }] } : {}) }
  return bounded(userId, "links.page", async (tx) => {
    const [rows, total] = await Promise.all([tx.link.findMany({ where: { AND: [where, p.afterWhere] }, take: p.take, orderBy: p.orderBy }), tx.link.count({ where })])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listProjectsPage(userId: string, input: PageInput = {}) {
  const scope = `projects:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.ProjectWhereInput = { userId, status: enumValue(ProjectStatus, p.status), ...(p.q ? { OR: [{ name: textMatch(p.q) }, { description: textMatch(p.q) }] } : {}) }
  return bounded(userId, "projects.page", async (tx) => {
    const [rows, total] = await Promise.all([tx.project.findMany({ where: { AND: [where, p.afterWhere] }, include: { _count: { select: { tasks: { where: { userId, status: { not: "DONE" } } } } } }, take: p.take, orderBy: p.orderBy }), tx.project.count({ where })])
    const totals = await tx.task.groupBy({ by: ["projectId"], where: { userId, projectId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    const counts = new Map(totals.map((r) => [r.projectId, r._count._all]))
    return pageResult(rows.map(({ _count, ...row }) => ({ ...row, openTaskCount: _count.tasks, taskCount: counts.get(row.id) ?? 0 })), total, p.limit, scope)
  })
}

export function listQuickDropPage(userId: string, input: PageInput = {}) {
  const scope = `quickdrop:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.QuickDropItemWhereInput = { userId, ...(p.q ? { content: textMatch(p.q) } : {}) }
  return bounded(userId, "quickdrop.page", async (tx) => {
    const [rows, total] = await Promise.all([tx.quickDropItem.findMany({ where: { AND: [where, p.afterWhere] }, take: p.take, orderBy: p.orderBy }), tx.quickDropItem.count({ where })])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listResumesPage(userId: string, input: PageInput = {}) {
  const scope = `resumes:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.ResumeWhereInput = { userId, ...(p.q ? { name: textMatch(p.q) } : {}) }
  return bounded(userId, "resumes.page", async (tx) => {
    const [rows, total] = await Promise.all([tx.resume.findMany({ where: { AND: [where, p.afterWhere] }, include: { currentVersion: true }, take: p.take, orderBy: p.orderBy }), tx.resume.count({ where })])
    return pageResult(rows, total, p.limit, scope)
  })
}

export function listCredentialsPage(userId: string, input: PageInput = {}) {
  const scope = `credentials:${userId}`
  const p = pageQuery(input, scope)
  const where: Prisma.CredentialWhereInput = { userId, ...(p.q ? { OR: [{ label: textMatch(p.q) }, { siteUrl: textMatch(p.q) }] } : {}) }
  return bounded(userId, "credentials.page", async (tx) => {
    // Explicit selection keeps encrypted secrets out even if Prisma's global omit changes.
    const [rows, total] = await Promise.all([tx.credential.findMany({ where: { AND: [where, p.afterWhere] }, select: { id: true, userId: true, label: true, siteUrl: true, username: true, notes: true, keyId: true, secretUpdatedAt: true, createdAt: true, updatedAt: true }, take: p.take, orderBy: p.orderBy }), tx.credential.count({ where })])
    return pageResult(rows, total, p.limit, scope)
  })
}

export const collectionReaders = { applications: listApplicationsPage, documents: listDocumentsPage, tasks: listTasksPage, links: listLinksPage, projects: listProjectsPage, quickdrop: listQuickDropPage, resumes: listResumesPage, credentials: listCredentialsPage }

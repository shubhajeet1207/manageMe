import { prisma } from "@/lib/db/prisma"
import type { Document, Prisma } from "@prisma/client"
import { escapeLikePattern } from "./like-pattern"

/**
 * Every function here takes `userId` as its FIRST parameter and puts it in the
 * `where`. Reads are `findFirst({ where: { id, userId } })`, never
 * `findUnique({ where: { id } })`; writes are `updateMany`/`deleteMany` scoped
 * by `{ id, userId }` and branch on `count`. A missing row and another user's
 * row are indistinguishable to the caller.
 */

const COMPANY_SELECT = { select: { id: true, name: true } } as const

export type DocumentWithCompany = Document & {
  company: { id: string; name: string } | null
}

/** The metadata an edit can change. The bytes and everything describing them
 *  are absent on purpose: a document's file is immutable (§7). */
export type DocumentMetadata = {
  title: string
  description?: string
  tags: string[]
  companyId?: string
  expiresOn?: Date
}

export type CreateDocumentData = DocumentMetadata & {
  originalFilename: string
  storageKey: string
  contentType: string
  sizeBytes: number
}

export type DocumentSearch = {
  query: string
  tags: string[]
}

/**
 * `userId` stays at the TOP level, outside the `OR` (§5.1c). Read as
 * *userId AND (title OR description OR filename)*, which is correct — the day
 * someone moves it inside that array to tidy it up, the tenancy boundary
 * disappears and every single-user test still passes.
 */
function searchWhere(userId: string, search: DocumentSearch): Prisma.DocumentWhereInput {
  // Prisma parameterises the value, so there is no injection here — but it does
  // not escape `%` and `_`, which are LIKE wildcards. Searching for "50%" would
  // otherwise match "50" followed by anything.
  const escaped = escapeLikePattern(search.query)

  return {
    userId,
    ...(search.tags.length > 0 ? { tags: { hasEvery: search.tags } } : {}),
    ...(search.query
      ? {
          OR: [
            { title: { contains: escaped, mode: "insensitive" as const } },
            { description: { contains: escaped, mode: "insensitive" as const } },
            // Included because "the thing I uploaded was called
            // Offer_Acme_Final.pdf" is a real way people remember a document,
            // even when the title has since been tidied up.
            { originalFilename: { contains: escaped, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }
}

export function listByUser(
  userId: string,
  search: DocumentSearch
): Promise<DocumentWithCompany[]> {
  return prisma.document.findMany({
    where: searchWhere(userId, search),
    include: { company: COMPANY_SELECT },
    orderBy: { createdAt: "desc" },
  })
}

export function findById(userId: string, id: string): Promise<DocumentWithCompany | null> {
  return prisma.document.findFirst({
    where: { id, userId },
    include: { company: COMPANY_SELECT },
  })
}

export function listByCompany(userId: string, companyId: string): Promise<Document[]> {
  return prisma.document.findMany({
    where: { userId, companyId },
    orderBy: { createdAt: "desc" },
  })
}

export function countByUser(userId: string): Promise<number> {
  return prisma.document.count({ where: { userId } })
}

export function create(userId: string, data: CreateDocumentData): Promise<Document> {
  return prisma.document.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      tags: data.tags,
      companyId: data.companyId ?? null,
      expiresOn: data.expiresOn ?? null,
      originalFilename: data.originalFilename,
      storageKey: data.storageKey,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
    },
  })
}

/**
 * Every optional field is mapped through `?? null`. Prisma reads `undefined` as
 * "don't change", so clearing one would be a silent no-op — the trap
 * `application-repository.ts` and `resume-repository.ts` both document.
 */
export async function update(
  userId: string,
  id: string,
  data: DocumentMetadata
): Promise<Document | null> {
  const { count } = await prisma.document.updateMany({
    where: { id, userId },
    data: {
      title: data.title,
      description: data.description ?? null,
      tags: data.tags,
      companyId: data.companyId ?? null,
      expiresOn: data.expiresOn ?? null,
    },
  })
  if (count === 0) return null
  return prisma.document.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.document.deleteMany({ where: { id, userId } })
  return count > 0
}

/**
 * One query, folded in memory — not `$queryRaw … unnest(tags) … GROUP BY`.
 * Raw SQL is where `where: { userId }` stops being mechanical, which is the one
 * place the ownership rule refuses to go for a user-owned table, and folding a
 * few hundred short arrays costs nothing.
 *
 * Sorted by count descending then tag ascending, so the chip order is stable.
 */
export async function listTags(userId: string): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.document.findMany({ where: { userId }, select: { tags: true } })

  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const tag of row.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

import { prisma } from "@/lib/db/prisma"
import type { Link } from "@prisma/client"
import type { CreateLinkInput } from "@/server/validators/link-schemas"

export function listByUser(userId: string, tag?: string): Promise<Link[]> {
  return prisma.link.findMany({
    where: { userId, ...(tag ? { tags: { has: tag } } : {}) },
    orderBy: { createdAt: "desc" },
  })
}

export function findById(userId: string, id: string): Promise<Link | null> {
  return prisma.link.findFirst({ where: { id, userId } })
}

/** The tag filter's options. No GIN index this phase: it is a scan over a
 *  `userId`-scoped subset that is hundreds of rows on a personal account, and
 *  `Resume.skills` set the same precedent. */
export async function listTags(userId: string): Promise<string[]> {
  const rows = await prisma.link.findMany({ where: { userId }, select: { tags: true } })

  // Deduped case-insensitively, keeping the first spelling seen, so the filter
  // chips match what the tag input already stores.
  const seen = new Map<string, string>()
  for (const row of rows) {
    for (const tag of row.tags) {
      const key = tag.toLocaleLowerCase()
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export function create(userId: string, data: CreateLinkInput): Promise<Link> {
  return prisma.link.create({
    data: {
      userId,
      url: data.url,
      title: data.title,
      description: data.description ?? null,
      tags: data.tags,
    },
  })
}

export async function update(
  userId: string,
  id: string,
  data: CreateLinkInput
): Promise<Link | null> {
  // `description ?? null`: Prisma reads `undefined` as "leave unchanged", so
  // clearing it would be a silent no-op. `tags` is always a real array, so the
  // list is authoritative and emptying it actually empties it.
  const { count } = await prisma.link.updateMany({
    where: { id, userId },
    data: {
      url: data.url,
      title: data.title,
      description: data.description ?? null,
      tags: data.tags,
    },
  })
  if (count === 0) return null
  return prisma.link.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.link.deleteMany({ where: { id, userId } })
  return count > 0
}

import * as linkRepository from "@/server/repositories/link-repository"
import type { CreateLinkInput } from "@/server/validators/link-schemas"
import type { Link } from "@prisma/client"

export class LinkNotFoundError extends Error {
  constructor() {
    super("Link not found")
  }
}

export function listLinks(userId: string, tag?: string): Promise<Link[]> {
  return linkRepository.listByUser(userId, tag)
}

export function listLinkTags(userId: string): Promise<string[]> {
  return linkRepository.listTags(userId)
}

export async function getLink(userId: string, id: string): Promise<Link> {
  const link = await linkRepository.findById(userId, id)
  if (!link) throw new LinkNotFoundError()
  return link
}

export function createLink(userId: string, input: CreateLinkInput): Promise<Link> {
  return linkRepository.create(userId, input)
}

export async function updateLink(
  userId: string,
  id: string,
  input: CreateLinkInput
): Promise<Link> {
  const updated = await linkRepository.update(userId, id, input)
  if (!updated) throw new LinkNotFoundError()
  return updated
}

export async function deleteLink(userId: string, id: string): Promise<void> {
  const deleted = await linkRepository.remove(userId, id)
  if (!deleted) throw new LinkNotFoundError()
}

import { z } from "zod"

export const pageInputSchema = z.object({
  cursor: z.string().max(600).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(100).default(""),
  status: z.string().max(30).optional(),
  companyId: z.string().max(100).optional(),
  projectId: z.string().max(100).optional(),
  applicationId: z.string().max(100).optional(),
  tag: z.string().max(30).optional(),
})
export type PageInput = z.input<typeof pageInputSchema>
export type PageResult<T> = { items: T[]; nextCursor: string | null; total: number }
const cursorSchema = z.object({ v: z.literal(1), id: z.string().min(1).max(100), at: z.iso.datetime(), scope: z.string().max(200) })

export function pageQuery(input: PageInput, scope: string) {
  const parsed = pageInputSchema.parse(input)
  let after: { createdAt: Date; id: string } | undefined
  if (parsed.cursor) {
    try {
      const cursor = cursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, "base64url").toString("utf8")))
      if (cursor.scope !== scope) throw new Error("Cursor belongs to a different collection")
      after = { createdAt: new Date(cursor.at), id: cursor.id }
    } catch { throw new InvalidCursorError() }
  }
  return {
    ...parsed,
    afterWhere: after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {},
    take: parsed.limit + 1,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  }
}

export class InvalidCursorError extends Error {
  constructor() { super("This page link has expired. Return to the first page."); this.name = "InvalidCursorError" }
}

export function pageResult<T extends { id: string; createdAt: Date }>(rows: T[], total: number, limit: number, scope: string): PageResult<T> {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return {
    items, total,
    nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ v: 1, id: last.id, at: last.createdAt.toISOString(), scope })).toString("base64url") : null,
  }
}

import { describe, expect, it } from "vitest"
import { InvalidCursorError, pageInputSchema, pageQuery, pageResult } from "./pagination"

describe("pageInputSchema", () => {
  it("coerces a query-string limit and supplies stable defaults", () => {
    expect(pageInputSchema.parse({ limit: "25" })).toEqual({ limit: 25, q: "" })
  })

  it("rejects page sizes that make collection reads unbounded", () => {
    expect(pageInputSchema.safeParse({ limit: "101" }).success).toBe(false)
    expect(pageInputSchema.safeParse({ limit: "0" }).success).toBe(false)
  })
})

describe("cursor pagination", () => {
  const scope = "applications:user-1"
  const newest = { id: "newest", createdAt: new Date("2026-10-17T10:00:00.000Z") }
  const older = { id: "older", createdAt: new Date("2026-10-17T09:00:00.000Z") }

  it("returns one extra row as a next-page cursor, not as an item", () => {
    const result = pageResult([newest, older], 2, 1, scope)

    expect(result.items).toEqual([newest])
    expect(result.total).toBe(2)
    expect(result.nextCursor).not.toBeNull()
  })

  it("round-trips a cursor into a createdAt/id boundary", () => {
    const cursor = pageResult([newest, older], 2, 1, scope).nextCursor
    const query = pageQuery({ cursor: cursor ?? undefined, limit: 1 }, scope)

    expect(query.afterWhere).toEqual({
      OR: [
        { createdAt: { lt: newest.createdAt } },
        { createdAt: newest.createdAt, id: { lt: newest.id } },
      ],
    })
    expect(query.take).toBe(2)
  })

  it("refuses a cursor minted for another collection or user", () => {
    const cursor = pageResult([newest, older], 2, 1, scope).nextCursor

    expect(() => pageQuery({ cursor: cursor ?? undefined }, "documents:user-1")).toThrow(
      InvalidCursorError
    )
    expect(() => pageQuery({ cursor: cursor ?? undefined }, "applications:user-2")).toThrow(
      InvalidCursorError
    )
  })

  it("maps malformed cursors to the one safe client error", () => {
    expect(() => pageQuery({ cursor: "not-a-cursor" }, scope)).toThrow(InvalidCursorError)
  })
})

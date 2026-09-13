import { describe, expect, it } from "vitest"
import {
  createTaskSchema,
  quickAddTaskSchema,
  setTaskDoneSchema,
  updateTaskSchema,
} from "./task-schemas"

describe("createTaskSchema", () => {
  it("accepts a title alone and defaults the status to TODO", () => {
    const parsed = createTaskSchema.parse({ title: "Send follow-up to Acme" })
    expect(parsed).toMatchObject({ title: "Send follow-up to Acme", status: "TODO" })
    expect(parsed.dueDate).toBeUndefined()
    expect(parsed.projectId).toBeUndefined()
    expect(parsed.applicationId).toBeUndefined()
  })

  it("rejects a blank title", () => {
    const result = createTaskSchema.safeParse({ title: "  " })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title?.[0]).toBe("Title is required")
    }
  })

  it("never accepts completedAt from the client", () => {
    const parsed = createTaskSchema.parse({
      title: "x",
      completedAt: new Date("2020-01-01"),
    }) as Record<string, unknown>
    expect(parsed.completedAt).toBeUndefined()
  })

  it("keeps every optional key optional", () => {
    const input: Parameters<typeof createTaskSchema.parse>[0] = { title: "x" }
    expect(createTaskSchema.parse(input).title).toBe("x")
  })
})

describe("dueDate", () => {
  it("parses YYYY-MM-DD to UTC midnight, not local midnight", () => {
    const parsed = createTaskSchema.parse({ title: "x", dueDate: "2026-09-14" })
    expect(parsed.dueDate?.toISOString()).toBe("2026-09-14T00:00:00.000Z")
  })

  it("turns an empty string into undefined", () => {
    expect(createTaskSchema.parse({ title: "x", dueDate: "" }).dueDate).toBeUndefined()
  })

  it("accepts a date in the past — a past due date is overdue, not invalid", () => {
    const parsed = createTaskSchema.parse({ title: "x", dueDate: "1999-01-01" })
    expect(parsed.dueDate?.toISOString()).toBe("1999-01-01T00:00:00.000Z")
  })

  it("accepts a date far in the future", () => {
    const parsed = createTaskSchema.parse({ title: "x", dueDate: "2099-12-31" })
    expect(parsed.dueDate?.toISOString()).toBe("2099-12-31T00:00:00.000Z")
  })

  it.each(["14-09-2026", "2026/09/14", "2026-9-14", "tomorrow", "2026-09-14T10:00:00Z"])(
    "rejects %s",
    (value) => {
      const result = createTaskSchema.safeParse({ title: "x", dueDate: value })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.dueDate?.[0]).toBe("Enter a valid date")
      }
    }
  )

  it("rejects a well-shaped but impossible date", () => {
    expect(createTaskSchema.safeParse({ title: "x", dueDate: "2026-02-31" }).success).toBe(false)
    expect(createTaskSchema.safeParse({ title: "x", dueDate: "2026-13-01" }).success).toBe(false)
  })
})

describe("projectId and applicationId", () => {
  it('turns a select\'s "None" ("") into undefined rather than storing an empty id', () => {
    const parsed = createTaskSchema.parse({ title: "x", projectId: "", applicationId: "" })
    expect(parsed.projectId).toBeUndefined()
    expect(parsed.applicationId).toBeUndefined()
  })

  it("keeps a real id", () => {
    const parsed = createTaskSchema.parse({ title: "x", projectId: "p1", applicationId: "a1" })
    expect(parsed.projectId).toBe("p1")
    expect(parsed.applicationId).toBe("a1")
  })
})

describe("updateTaskSchema", () => {
  it("requires an id", () => {
    expect(updateTaskSchema.safeParse({ title: "x" }).success).toBe(false)
    expect(updateTaskSchema.safeParse({ id: "t1", title: "x" }).success).toBe(true)
  })
})

describe("quickAddTaskSchema", () => {
  it("takes a title and an optional owner, and nothing else", () => {
    const parsed = quickAddTaskSchema.parse({ title: "Buy milk", projectId: "p1" })
    expect(parsed).toEqual({ title: "Buy milk", projectId: "p1" })
  })

  it("rejects a blank title", () => {
    expect(quickAddTaskSchema.safeParse({ title: "" }).success).toBe(false)
  })
})

describe("setTaskDoneSchema", () => {
  it("takes an id and a boolean", () => {
    expect(setTaskDoneSchema.parse({ id: "t1", done: true })).toEqual({ id: "t1", done: true })
  })

  it("rejects a non-boolean", () => {
    expect(setTaskDoneSchema.safeParse({ id: "t1", done: "yes" }).success).toBe(false)
  })
})

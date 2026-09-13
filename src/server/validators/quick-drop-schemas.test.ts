import { describe, expect, it } from "vitest"
import { LONG_TEXT_MAX } from "./limits"
import {
  createQuickDropSchema,
  quickDropIdSchema,
  triageToLinkSchema,
  triageToProjectSchema,
  triageToTaskSchema,
} from "./quick-drop-schemas"

describe("createQuickDropSchema", () => {
  it("takes one content field and nothing else", () => {
    expect(createQuickDropSchema.parse({ content: "  read this  " })).toEqual({
      content: "read this",
    })
  })

  it("rejects blank content", () => {
    const result = createQuickDropSchema.safeParse({ content: "   " })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.content?.[0]).toBe("Type or paste something")
    }
  })

  it("rejects content past the long-text cap", () => {
    expect(createQuickDropSchema.safeParse({ content: "x".repeat(LONG_TEXT_MAX + 1) }).success).toBe(
      false
    )
  })

  it("has no kind, no title and no type — whether it is a URL is computed", () => {
    expect(Object.keys(createQuickDropSchema.shape)).toEqual(["content"])
  })
})

describe("quickDropIdSchema", () => {
  it("requires an id", () => {
    expect(quickDropIdSchema.safeParse({}).success).toBe(false)
    expect(quickDropIdSchema.parse({ id: "q1" })).toEqual({ id: "q1" })
  })
})

describe("triage schemas", () => {
  it("carries the item id alongside the task payload", () => {
    const parsed = triageToTaskSchema.parse({ quickDropItemId: "q1", title: "Do the thing" })
    expect(parsed.quickDropItemId).toBe("q1")
    expect(parsed.title).toBe("Do the thing")
  })

  it("carries the item id alongside the link payload", () => {
    const parsed = triageToLinkSchema.parse({
      quickDropItemId: "q1",
      url: "https://example.com",
      title: "x",
    })
    expect(parsed.quickDropItemId).toBe("q1")
  })

  it("carries the item id alongside the project payload", () => {
    const parsed = triageToProjectSchema.parse({ quickDropItemId: "q1", name: "Portfolio" })
    expect(parsed.quickDropItemId).toBe("q1")
  })

  it("requires the item id on every triage", () => {
    expect(triageToTaskSchema.safeParse({ title: "x" }).success).toBe(false)
    expect(triageToLinkSchema.safeParse({ url: "https://x.com", title: "x" }).success).toBe(false)
    expect(triageToProjectSchema.safeParse({ name: "x" }).success).toBe(false)
  })

  it("still refuses a javascript: url on the link triage path", () => {
    expect(
      triageToLinkSchema.safeParse({
        quickDropItemId: "q1",
        url: "javascript:alert(1)",
        title: "x",
      }).success
    ).toBe(false)
  })
})

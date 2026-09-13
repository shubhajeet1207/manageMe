import { describe, expect, it } from "vitest"
import { MAX_LINK_TAGS, createLinkSchema, updateLinkSchema } from "./link-schemas"

describe("createLinkSchema", () => {
  it("accepts a url and a title", () => {
    const parsed = createLinkSchema.parse({
      url: "https://example.com/guide",
      title: "Salary guide",
    })
    expect(parsed).toMatchObject({ url: "https://example.com/guide", title: "Salary guide" })
    expect(parsed.tags).toEqual([])
    expect(parsed.description).toBeUndefined()
  })

  it("requires a url", () => {
    expect(createLinkSchema.safeParse({ title: "x" }).success).toBe(false)
    expect(createLinkSchema.safeParse({ url: "", title: "x" }).success).toBe(false)
  })

  it.each(["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "vbscript:x"])(
    "rejects %s on the required url field too",
    (value) => {
      const result = createLinkSchema.safeParse({ url: value, title: "x" })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.url?.[0]).toBe("Enter a valid URL")
      }
    }
  )

  it("rejects a blank title — a list of bare URLs cannot be scanned", () => {
    const result = createLinkSchema.safeParse({ url: "https://example.com", title: "  " })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title?.[0]).toBe("Title is required")
    }
  })

  it("dedupes tags case-insensitively, keeping the first spelling", () => {
    const parsed = createLinkSchema.parse({
      url: "https://example.com",
      title: "x",
      tags: ["Salary", "salary", "Prep"],
    })
    expect(parsed.tags).toEqual(["Salary", "Prep"])
  })

  it("caps tags after the dedupe", () => {
    const tags = Array.from({ length: MAX_LINK_TAGS + 1 }, (_, i) => `t${i}`)
    expect(
      createLinkSchema.safeParse({ url: "https://example.com", title: "x", tags }).success
    ).toBe(false)
  })

  it("keeps every optional key optional", () => {
    const input: Parameters<typeof createLinkSchema.parse>[0] = {
      url: "https://example.com",
      title: "x",
    }
    expect(createLinkSchema.parse(input).title).toBe("x")
  })
})

describe("updateLinkSchema", () => {
  it("requires an id", () => {
    expect(
      updateLinkSchema.safeParse({ url: "https://example.com", title: "x" }).success
    ).toBe(false)
    expect(
      updateLinkSchema.safeParse({ id: "l1", url: "https://example.com", title: "x" }).success
    ).toBe(true)
  })
})

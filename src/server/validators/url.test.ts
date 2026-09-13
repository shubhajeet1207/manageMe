import { describe, expect, it } from "vitest"
import { z } from "zod"
import { httpUrl, isHttpUrl, optionalHttpUrl } from "./url"

const REJECTED = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "  javascript:alert(1)  ",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "vbscript:msgbox(1)",
  "ftp://example.com/x",
  "mailto:someone@example.com",
  "not a url",
]

const ACCEPTED = ["http://example.com", "https://example.com/path?q=1#frag"]

describe("httpUrl", () => {
  const schema = z.object({ url: httpUrl() })

  it.each(REJECTED)("rejects %s", (value) => {
    expect(schema.safeParse({ url: value }).success).toBe(false)
  })

  it.each(ACCEPTED)("accepts %s", (value) => {
    expect(schema.safeParse({ url: value })).toMatchObject({ success: true })
  })

  it("rejects an empty string, because it is required", () => {
    expect(schema.safeParse({ url: "" }).success).toBe(false)
  })

  it("trims surrounding whitespace", () => {
    const parsed = schema.parse({ url: "  https://example.com  " })
    expect(parsed.url).toBe("https://example.com")
  })

  it("uses the message it is given", () => {
    const custom = z.object({ url: httpUrl("Enter the job posting URL") })
    const result = custom.safeParse({ url: "javascript:alert(1)" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.url?.[0]).toBe("Enter the job posting URL")
    }
  })
})

describe("optionalHttpUrl", () => {
  const schema = z.object({ url: optionalHttpUrl() })

  it.each(REJECTED)("rejects %s", (value) => {
    expect(schema.safeParse({ url: value }).success).toBe(false)
  })

  it.each(ACCEPTED)("accepts %s", (value) => {
    expect(schema.safeParse({ url: value })).toMatchObject({ success: true })
  })

  it("accepts an empty string and transforms it to undefined", () => {
    expect(schema.parse({ url: "" }).url).toBeUndefined()
  })

  it("accepts whitespace only and transforms it to undefined", () => {
    expect(schema.parse({ url: "   " }).url).toBeUndefined()
  })

  it("keeps the key optional rather than making it required-and-undefined", () => {
    // The Zod 4 footgun: a transform applied AFTER .optional() hides the
    // optional marker from key inference, so omitting the field stops
    // typechecking. This line is the regression test, and it is a type-level
    // assertion as much as a runtime one.
    const parsed: z.infer<typeof schema> = {}
    expect(schema.parse(parsed).url).toBeUndefined()
  })
})

describe("isHttpUrl", () => {
  it.each(REJECTED)("is false for %s", (value) => {
    expect(isHttpUrl(value)).toBe(false)
  })

  it.each(ACCEPTED)("is true for %s", (value) => {
    expect(isHttpUrl(value)).toBe(true)
  })

  it("is false for an empty string", () => {
    expect(isHttpUrl("")).toBe(false)
  })

  it("is false for text that merely mentions a URL", () => {
    expect(isHttpUrl("check https://example.com out")).toBe(false)
  })
})

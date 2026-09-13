import { describe, expect, it } from "vitest"
import { MAX_DOCUMENT_TAGS } from "@/server/validators/document-schemas"
import { documentsHref, parseQuery, parseTags } from "./search-params"

describe("parseTags", () => {
  it("reads a single ?tag= as a one-element list", () => {
    expect(parseTags("payslip")).toEqual(["payslip"])
  })

  it("reads a repeated ?tag= as an array", () => {
    // `searchParams.tag` is `string | string[] | undefined` depending on how
    // many times the parameter appears, and code assuming one shape breaks on
    // the other.
    expect(parseTags(["payslip", "2026"])).toEqual(["payslip", "2026"])
  })

  it("reads an absent parameter as an empty list", () => {
    expect(parseTags(undefined)).toEqual([])
  })

  it("drops a blank value", () => {
    expect(parseTags("")).toEqual([])
    expect(parseTags(["payslip", "   ", ""])).toEqual(["payslip"])
  })

  it("trims each value", () => {
    expect(parseTags(["  payslip  "])).toEqual(["payslip"])
  })

  it("deduplicates case-insensitively, keeping the first spelling", () => {
    expect(parseTags(["Payslip", "payslip", "PAYSLIP"])).toEqual(["Payslip"])
  })

  it("caps the list at the tag maximum", () => {
    const tags = Array.from({ length: 30 }, (_, index) => `tag-${index}`)
    expect(parseTags(tags)).toHaveLength(MAX_DOCUMENT_TAGS)
  })

  it("drops an over-long value rather than sending it to the database", () => {
    expect(parseTags(["a".repeat(31)])).toEqual([])
  })
})

describe("parseQuery", () => {
  it("trims a query", () => {
    expect(parseQuery("  offer  ")).toBe("offer")
  })

  it("reads an absent or blank query as an empty string", () => {
    expect(parseQuery(undefined)).toBe("")
    expect(parseQuery("   ")).toBe("")
  })

  it("takes the first value when the parameter repeats", () => {
    expect(parseQuery(["offer", "payslip"])).toBe("offer")
  })

  it("truncates a query past the cap", () => {
    expect(parseQuery("a".repeat(200))).toHaveLength(100)
  })
})

describe("documentsHref", () => {
  it("returns the bare path with no filters", () => {
    expect(documentsHref({ query: "", tags: [] })).toBe("/documents")
  })

  it("carries the query", () => {
    expect(documentsHref({ query: "offer", tags: [] })).toBe("/documents?q=offer")
  })

  it("carries every tag as a repeated parameter", () => {
    expect(documentsHref({ query: "", tags: ["payslip", "2026"] })).toBe(
      "/documents?tag=payslip&tag=2026"
    )
  })

  it("round-trips query and tags together, so changing one never drops the other", () => {
    const href = documentsHref({ query: "offer letter", tags: ["Acme", "2026"] })
    const params = new URL(href, "http://localhost").searchParams
    expect(parseQuery(params.get("q") ?? undefined)).toBe("offer letter")
    expect(parseTags(params.getAll("tag"))).toEqual(["Acme", "2026"])
  })
})

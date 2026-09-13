import { describe, expect, it } from "vitest"
import { escapeLikePattern } from "./like-pattern"

describe("escapeLikePattern", () => {
  it("leaves a plain query alone", () => {
    expect(escapeLikePattern("offer letter")).toBe("offer letter")
  })

  it("escapes a percent so `50%` does not match `50` followed by anything", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%")
  })

  it("escapes an underscore so it matches a literal underscore", () => {
    expect(escapeLikePattern("offer_acme")).toBe("offer\\_acme")
  })

  it("escapes a backslash", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b")
  })

  it("escapes the backslash FIRST, so an escape is never double-applied", () => {
    // Naive ordering turns `\` into `\\` after `%` has already become `\%`,
    // producing `\\%` — an escaped backslash followed by a live wildcard.
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%")
  })

  it("escapes a bare percent, which would otherwise match everything", () => {
    expect(escapeLikePattern("%")).toBe("\\%")
  })

  it("escapes all three metacharacters in one string", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d")
  })

  it("returns an empty string unchanged", () => {
    expect(escapeLikePattern("")).toBe("")
  })
})

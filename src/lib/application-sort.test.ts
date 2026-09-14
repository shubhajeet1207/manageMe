import { describe, expect, it } from "vitest"
import {
  APPLICATION_SORT_KEYS,
  DEFAULT_APPLICATION_SORT,
  SORT_DIRECTIONS,
  isDefaultApplicationSort,
  naturalDirectionFor,
  resolveApplicationSort,
} from "./application-sort"

describe("APPLICATION_SORT_KEYS", () => {
  // The table promises these five columns. A key removed here is a header that
  // silently stops sorting, so the promise is written down rather than implied
  // by whatever the array happens to contain.
  it("covers every column the applications table offers", () => {
    expect([...APPLICATION_SORT_KEYS].sort()).toEqual([
      "applied",
      "company",
      "role",
      "status",
      "updated",
    ])
  })

  it("gives every key a natural direction", () => {
    for (const key of APPLICATION_SORT_KEYS) {
      expect(SORT_DIRECTIONS).toContain(naturalDirectionFor(key))
    }
  })

  it("opens date columns newest-first and the rest ascending", () => {
    expect(naturalDirectionFor("applied")).toBe("desc")
    expect(naturalDirectionFor("updated")).toBe("desc")
    expect(naturalDirectionFor("company")).toBe("asc")
    expect(naturalDirectionFor("role")).toBe("asc")
    // A status sort that opened on REJECTED would read as broken.
    expect(naturalDirectionFor("status")).toBe("asc")
  })
})

describe("resolveApplicationSort", () => {
  it("returns the key and direction it was given", () => {
    for (const key of APPLICATION_SORT_KEYS) {
      for (const direction of SORT_DIRECTIONS) {
        expect(resolveApplicationSort({ key, direction })).toEqual({ key, direction })
      }
    }
  })

  it("is idempotent, so the page and the repository cannot disagree", () => {
    for (const key of APPLICATION_SORT_KEYS) {
      for (const direction of SORT_DIRECTIONS) {
        const once = resolveApplicationSort({ key, direction })
        expect(resolveApplicationSort(once)).toEqual(once)
      }
    }
  })

  it("falls back to the default when nothing is given", () => {
    expect(resolveApplicationSort(undefined)).toEqual(DEFAULT_APPLICATION_SORT)
    expect(resolveApplicationSort({})).toEqual(DEFAULT_APPLICATION_SORT)
    expect(resolveApplicationSort({ key: undefined })).toEqual(DEFAULT_APPLICATION_SORT)
  })

  it("keeps the default at updatedAt descending, which is what callers had before", () => {
    expect(DEFAULT_APPLICATION_SORT).toEqual({ key: "updated", direction: "desc" })
  })

  // The precedent: `?status=toString` reached a lookup and 500'd the page,
  // because `value in Enum` and `Enum[value]` both walk the prototype chain.
  // An allowlist read with `.includes` is the fix, and these are the names that
  // would sail through the version without it.
  it.each(["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"])(
    "rejects the inherited property name %s",
    (key) => {
      expect(resolveApplicationSort({ key })).toEqual(DEFAULT_APPLICATION_SORT)
    }
  )

  // Column names are the plausible guess for a hand-edited URL, and they are
  // exactly what must NOT be forwarded to Prisma.
  it.each(["roleTitle", "updatedAt", "appliedAt", "company.name", "id", "userId"])(
    "rejects the raw column name %s",
    (key) => {
      expect(resolveApplicationSort({ key })).toEqual(DEFAULT_APPLICATION_SORT)
    }
  )

  it.each(["", " ", "ROLE", "Role", "not-a-column", "role;drop"])(
    "rejects the garbage key %o",
    (key) => {
      expect(resolveApplicationSort({ key })).toEqual(DEFAULT_APPLICATION_SORT)
    }
  )

  it("rejects a repeated ?sort=, which Next hands over as an array", () => {
    // The declared type says string; the runtime value for `?sort=role&sort=company`
    // is `["role", "company"]`, and `.includes` refuses it like any other garbage.
    const repeated = { key: ["role", "company"] } as unknown as { key?: string }
    expect(resolveApplicationSort(repeated)).toEqual(DEFAULT_APPLICATION_SORT)
  })

  it("keeps a valid column when only the direction is junk", () => {
    // Answering "by company, sideways" with "by updated" would throw away the
    // half of the request that was fine.
    expect(resolveApplicationSort({ key: "company", direction: "sideways" })).toEqual({
      key: "company",
      direction: "asc",
    })
    expect(resolveApplicationSort({ key: "applied", direction: "" })).toEqual({
      key: "applied",
      direction: "desc",
    })
    expect(resolveApplicationSort({ key: "role", direction: "ASC" })).toEqual({
      key: "role",
      direction: "asc",
    })
  })

  it("does not let a junk direction rescue a junk key", () => {
    expect(resolveApplicationSort({ key: "toString", direction: "asc" })).toEqual(
      DEFAULT_APPLICATION_SORT
    )
  })
})

describe("isDefaultApplicationSort", () => {
  it("is true only for the exact default", () => {
    expect(isDefaultApplicationSort(DEFAULT_APPLICATION_SORT)).toBe(true)
    expect(isDefaultApplicationSort({ key: "updated", direction: "asc" })).toBe(false)
    expect(isDefaultApplicationSort({ key: "company", direction: "desc" })).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { z } from "zod"
import { tagList } from "./tags"

const schema = z.object({ tags: tagList({ max: 3, maxLength: 10 }) })

describe("tagList", () => {
  it("keeps the tags it is given, in order", () => {
    expect(schema.parse({ tags: ["salary", "prep"] }).tags).toEqual(["salary", "prep"])
  })

  it("trims each tag", () => {
    expect(schema.parse({ tags: ["  salary  "] }).tags).toEqual(["salary"])
  })

  it("dedupes case-insensitively, keeping the first spelling typed", () => {
    expect(schema.parse({ tags: ["React", "react", "REACT"] }).tags).toEqual(["React"])
  })

  it("counts the cap after the dedupe, not before", () => {
    // Four entries of which two are the same tag is a three-tag list.
    expect(schema.parse({ tags: ["a", "b", "c", "A"] }).tags).toEqual(["a", "b", "c"])
  })

  it("rejects more tags than the cap once deduped", () => {
    expect(schema.safeParse({ tags: ["a", "b", "c", "d"] }).success).toBe(false)
  })

  it("rejects a blank tag", () => {
    expect(schema.safeParse({ tags: ["ok", "   "] }).success).toBe(false)
  })

  it("rejects a tag longer than maxLength", () => {
    expect(schema.safeParse({ tags: ["a".repeat(11)] }).success).toBe(false)
  })

  it("accepts an empty list", () => {
    expect(schema.parse({ tags: [] }).tags).toEqual([])
  })
})

describe("tagList messages", () => {
  const skills = z.object({ skills: tagList({ max: 50, maxLength: 50, noun: "skills" }) })

  it("uses the noun it is given, so a resume keeps saying skills", () => {
    const blank = skills.safeParse({ skills: ["   "] })
    expect(blank.success).toBe(false)
    if (!blank.success) {
      expect(blank.error.flatten().fieldErrors.skills?.[0]).toBe("Skills cannot be blank")
    }

    const tooMany = skills.safeParse({ skills: Array.from({ length: 51 }, (_, i) => `s${i}`) })
    expect(tooMany.success).toBe(false)
    if (!tooMany.success) {
      expect(tooMany.error.flatten().fieldErrors.skills?.[0]).toBe("Add at most 50 skills")
    }
  })
})

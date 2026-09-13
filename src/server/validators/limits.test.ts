import { describe, expect, it } from "vitest"
import { z } from "zod"
import { LONG_TEXT_MAX, SHORT_TEXT_MAX, optionalLongText, optionalShortText } from "./limits"

describe("text limits", () => {
  it("states both caps as constants rather than scattering numbers", () => {
    expect(SHORT_TEXT_MAX).toBe(500)
    expect(LONG_TEXT_MAX).toBe(2000)
  })
})

describe.each([
  ["optionalShortText", optionalShortText, SHORT_TEXT_MAX],
  ["optionalLongText", optionalLongText, LONG_TEXT_MAX],
] as const)("%s", (_name, field, max) => {
  const schema = z.object({ value: field })

  it("transforms an empty string to undefined", () => {
    expect(schema.parse({ value: "" }).value).toBeUndefined()
  })

  it("transforms whitespace to undefined", () => {
    expect(schema.parse({ value: "   " }).value).toBeUndefined()
  })

  it("keeps the key optional", () => {
    const parsed: z.infer<typeof schema> = {}
    expect(schema.parse(parsed).value).toBeUndefined()
  })

  it("accepts text at the cap", () => {
    expect(schema.parse({ value: "x".repeat(max) }).value).toHaveLength(max)
  })

  it("rejects text past the cap", () => {
    expect(schema.safeParse({ value: "x".repeat(max + 1) }).success).toBe(false)
  })
})

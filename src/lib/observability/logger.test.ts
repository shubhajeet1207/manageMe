import { afterEach, describe, expect, it, vi } from "vitest"
import { actorHash, redact } from "./logger"

afterEach(() => vi.unstubAllEnvs())

describe("redact", () => {
  it("redacts sensitive fields recursively", () => {
    expect(
      redact({
        operation: "upload",
        email: "person@example.com",
        nested: { authorization: "Bearer secret", count: 2 },
      })
    ).toEqual({
      operation: "upload",
      email: "[redacted]",
      nested: { authorization: "[redacted]", count: 2 },
    })
  })

  it("removes URLs and email addresses embedded in otherwise safe strings", () => {
    expect(redact("failed for person@example.com at https://example.com/private?q=secret")).toBe(
      "failed for [email] at [url]"
    )
  })

  it("reduces errors to a safe name and machine code", () => {
    const error = Object.assign(new Error("token abc123 was rejected"), { code: "AUTH_REJECTED" })
    expect(redact(error)).toEqual({ name: "Error", code: "AUTH_REJECTED" })
  })
})

describe("actorHash", () => {
  it("is stable without exposing the user id", () => {
    vi.stubEnv("OBSERVABILITY_HASH_KEY", "observability-test-key")
    const first = actorHash("user-sensitive-id")

    expect(first).toBe(actorHash("user-sensitive-id"))
    expect(first).not.toContain("user-sensitive-id")
    expect(first).toHaveLength(20)
  })

  it("does not emit a raw id when no hashing secret exists", () => {
    vi.stubEnv("OBSERVABILITY_HASH_KEY", "")
    vi.stubEnv("AUTH_SECRET", "")
    expect(actorHash("user-sensitive-id")).toBe("anonymous")
  })
})

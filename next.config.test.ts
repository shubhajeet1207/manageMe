import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "@/server/files/content-types"
import nextConfig from "./next.config"

/** "12mb" → 12582912. Only the units Next accepts for these two options. */
function parseBodySize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(value.trim())
  if (!match) throw new Error(`Unparseable body size limit: ${value}`)
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  }
  return Number(match[1]) * multipliers[match[2].toLowerCase()]
}

// A comment is not a guard (§8.5). MAX_UPLOAD_BYTES may not be raised without
// raising BOTH framework limits in the same commit, and both must stay strictly
// above it: `proxyClientMaxBodySize` does not reject an oversized body, it
// silently truncates it.
describe("Next body-size limits", () => {
  it("sets both limits", () => {
    expect(typeof nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("string")
    expect(typeof nextConfig.experimental?.proxyClientMaxBodySize).toBe("string")
  })

  it("keeps serverActions.bodySizeLimit strictly above MAX_UPLOAD_BYTES", () => {
    const limit = parseBodySize(String(nextConfig.experimental?.serverActions?.bodySizeLimit))
    expect(limit).toBeGreaterThan(MAX_UPLOAD_BYTES)
  })

  it("keeps proxyClientMaxBodySize strictly above MAX_UPLOAD_BYTES", () => {
    const limit = parseBodySize(String(nextConfig.experimental?.proxyClientMaxBodySize))
    expect(limit).toBeGreaterThan(MAX_UPLOAD_BYTES)
  })
})

// Next 16 logs every incoming request in dev, arguments included: a Server
// Action's payload is printed verbatim, which for createCredentialAction and
// updateCredentialAction IS a stored vault password.
describe("request logging", () => {
  it("keeps incoming-request logging off so a Server Action's arguments are never printed", () => {
    expect(nextConfig.logging && nextConfig.logging.incomingRequests).toBe(false)
  })
})

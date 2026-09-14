import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "@/server/files/content-types"
import nextConfig, { securityHeaders, serverActionAllowedOrigins } from "./next.config"

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

// The floating dev-tools badge overlaps the sidebar's lower content. Asserted
// because "off by request" is otherwise a comment somebody deletes.
describe("dev indicators", () => {
  it("keeps the dev-tools badge off", () => {
    expect(nextConfig.devIndicators).toBe(false)
  })
})

/** Every `key` in a header block, lower-cased, for presence assertions. */
function keysOf(headers: { key: string; value: string }[]): string[] {
  return headers.map((h) => h.key.toLowerCase())
}

/** The value of one header, or undefined. Header keys are case-insensitive. */
function valueOf(headers: { key: string; value: string }[], key: string): string | undefined {
  return headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

/** `"script-src"` → `"'self' 'unsafe-inline'"`, from a joined CSP string. */
function directive(csp: string, name: string): string | undefined {
  const match = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `))
  if (!match) return undefined
  return match.slice(name.length).trim()
}

const PROD = securityHeaders(true)
const DEV = securityHeaders(false)
const PROD_CSP = valueOf(PROD, "Content-Security-Policy") ?? ""
const DEV_CSP = valueOf(DEV, "Content-Security-Policy") ?? ""

describe("security headers", () => {
  it.each([
    "content-security-policy",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "x-content-type-options",
  ])("sets %s in both dev and production", (key) => {
    expect(keysOf(PROD)).toContain(key)
    expect(keysOf(DEV)).toContain(key)
  })

  // HSTS is only honoured over HTTPS, and a browser that records it for
  // `localhost` refuses plain http to that port for the next two years — across
  // every other project the developer runs there.
  it("sends HSTS in production and never in development", () => {
    expect(valueOf(PROD, "Strict-Transport-Security")).toMatch(/^max-age=\d+/)
    expect(valueOf(DEV, "Strict-Transport-Security")).toBeUndefined()
  })

  it("sets an HSTS max-age of at least a year", () => {
    const maxAge = Number(/max-age=(\d+)/.exec(valueOf(PROD, "Strict-Transport-Security") ?? "")?.[1])
    expect(maxAge).toBeGreaterThanOrEqual(31536000)
  })

  // The leak this closes: every external job posting is opened from an <a href>
  // inside /applications/[id], which handed the job board the referring URL.
  // Both values below strip the path cross-origin; anything else does not.
  it("keeps the referrer off cross-origin requests", () => {
    expect(valueOf(PROD, "Referrer-Policy")).toBeOneOf([
      "same-origin",
      "strict-origin-when-cross-origin",
    ])
  })

  it("removes the X-Powered-By banner", () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})

describe("Content-Security-Policy", () => {
  it("starts from default-src 'self'", () => {
    expect(directive(PROD_CSP, "default-src")).toBe("'self'")
  })

  // This app renders every resume and every PDF document through
  // src/components/pdf-preview.tsx, which is an <object data="/api/…/file">.
  // `object-src 'none'` is what every CSP guide reaches for first and it is
  // precisely what blanks that preview — the failure is silent, because
  // <object> falls back to its children and the page still looks fine.
  it("permits <object> from this origin, because the PDF preview is one", () => {
    for (const csp of [PROD_CSP, DEV_CSP]) {
      const objectSrc = directive(csp, "object-src")
      expect(objectSrc).toBeDefined()
      expect(objectSrc).not.toBe("'none'")
      expect(objectSrc).toContain("'self'")
    }
  })

  // Same trap one directive down: the PDF viewer runs in a nested browsing
  // context, so 'none' here refuses our own preview along with everyone else's.
  it("permits framing our own origin while refusing every other", () => {
    expect(directive(PROD_CSP, "frame-ancestors")).toBe("'self'")
    expect(valueOf(PROD, "X-Frame-Options")).toBe("SAMEORIGIN")
  })

  // Next inlines the RSC flight payload on every page and next-themes inlines a
  // pre-paint script in <head>. With no nonce in play, dropping 'unsafe-inline'
  // does not harden this app, it blanks it.
  it("allows the inline scripts Next and next-themes emit", () => {
    for (const csp of [PROD_CSP, DEV_CSP]) {
      expect(directive(csp, "script-src")).toContain("'unsafe-inline'")
      expect(directive(csp, "style-src")).toContain("'unsafe-inline'")
    }
  })

  // React uses eval in development to rebuild server stacks in the error
  // overlay; neither React nor Next uses it in a production build.
  it("confines 'unsafe-eval' to development", () => {
    expect(directive(DEV_CSP, "script-src")).toContain("'unsafe-eval'")
    expect(directive(PROD_CSP, "script-src")).not.toContain("'unsafe-eval'")
  })

  // Turbopack pushes HMR over a WebSocket. Without this the page stops
  // refreshing on save — and shipping it to production would widen connect-src
  // for nothing.
  it("confines the HMR WebSocket origins to development", () => {
    expect(directive(DEV_CSP, "connect-src")).toContain("ws:")
    expect(directive(PROD_CSP, "connect-src")).toBe("'self'")
  })

  it("upgrades insecure requests in production only", () => {
    expect(PROD_CSP).toContain("upgrade-insecure-requests")
    expect(DEV_CSP).not.toContain("upgrade-insecure-requests")
  })

  it.each(["base-uri", "form-action"])("locks %s to this origin", (name) => {
    expect(directive(PROD_CSP, name)).toBe("'self'")
  })

  // No third-party script origin has ever been needed here, and the day one is
  // added it should be a visible decision rather than an inherited wildcard.
  it("names no external origin and no wildcard", () => {
    expect(PROD_CSP).not.toContain("*")
    expect(PROD_CSP).not.toMatch(/https?:\/\//)
  })
})

describe("headers() route matching", () => {
  // Mirrors what Next compiles this `source` to via its bundled path-to-regexp
  // (`/^(?:\/((?!api\/documents\/|api\/resume-versions\/).*))[\/#\?]?$/i`), and
  // agrees with it on every path asserted below.
  async function headerRule() {
    const rules = await nextConfig.headers!()
    expect(rules).toHaveLength(1)
    return rules[0]
  }

  function matches(source: string, path: string): boolean {
    return new RegExp(`^${source}$`).test(path)
  }

  it.each(["/", "/login", "/dashboard", "/applications/abc", "/api/health", "/api/auth/session"])(
    "covers %s",
    async (path) => {
      const rule = await headerRule()
      expect(matches(rule.source, path)).toBe(true)
    }
  )

  // src/server/files/file-response.ts owns the header set for these two routes —
  // including a far tighter `default-src 'none'; sandbox` — and says so: "the day
  // a header needs adding, one file should change rather than two". A block here
  // that reached them would either override that policy with a looser one or
  // leave two definitions of it to drift apart.
  it.each(["/api/documents/abc/file", "/api/resume-versions/abc/file"])(
    "leaves %s to file-response.ts",
    async (path) => {
      const rule = await headerRule()
      expect(matches(rule.source, path)).toBe(false)
    }
  )

  // Under vitest NODE_ENV is "test", so the non-production set is what the
  // config must resolve to — no HSTS. Comparing key lists rather than values
  // makes this a check on the WIRING (that the flag is read from the
  // environment at all) rather than a restatement of securityHeaders().
  it("resolves its header set from NODE_ENV rather than hard-coding one", async () => {
    const rule = await headerRule()
    const keys = keysOf(rule.headers as { key: string; value: string }[])
    expect(keys).toEqual(keysOf(DEV))
    expect(keys).not.toEqual(keysOf(PROD))
  })
})

// Every mutation in this app is a Server Action, and Next's Origin-vs-Host
// comparison is the only CSRF control on them — there is no token. This list is
// the one escape hatch from that comparison, so what goes in it matters.
describe("serverActions.allowedOrigins", () => {
  it("is configured", () => {
    expect(Array.isArray(nextConfig.experimental?.serverActions?.allowedOrigins)).toBe(true)
  })

  // Next compares against `new URL(originHeader).host`, which keeps the port.
  // An entry without it never matches a dev or non-443 deployment.
  it("keeps the port, because that is what Next compares against", () => {
    expect(serverActionAllowedOrigins("http://localhost:3000")).toEqual(["localhost:3000"])
    expect(serverActionAllowedOrigins("https://app.example.com/some/path")).toEqual([
      "app.example.com",
    ])
  })

  // Falling back to an empty list means Next accepts same-origin only, which is
  // the safe direction. Falling back to something broad would not be.
  it.each([undefined, "", "not a url", "app.example.com", "ftp://app.example.com"])(
    "yields an empty list for %j rather than guessing",
    (value) => {
      expect(serverActionAllowedOrigins(value)).toEqual([])
    }
  )

  // Next reads `*.example.com` here as a real wildcard (`matchWildcardDomain`
  // in next/dist/server/app-render/csrf-protection.js), so passing one through
  // would open Server Actions to every subdomain — from a variable that names
  // one origin and that nobody would read as a pattern.
  it("refuses to turn a stray wildcard into a subdomain-wide exemption", () => {
    expect(serverActionAllowedOrigins("https://*.example.com")).toEqual([])
  })

  it("never emits a wildcard or a blank entry", () => {
    for (const input of [
      "https://app.example.com",
      "http://localhost:3000",
      "https://*.example.com",
    ]) {
      for (const origin of serverActionAllowedOrigins(input)) {
        expect(origin).not.toBe("")
        expect(origin).not.toContain("*")
      }
    }
  })
})

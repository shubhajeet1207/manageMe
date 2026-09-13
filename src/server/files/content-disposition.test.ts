import { describe, expect, it } from "vitest"
import { contentDisposition } from "./content-disposition"

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const NUL = String.fromCharCode(0)
const BEL = String.fromCharCode(7)

function asciiParam(header: string): string {
  const match = /filename="([^"]*)"/.exec(header)
  expect(match).not.toBeNull()
  return match![1]
}

describe("contentDisposition", () => {
  it("builds an inline header for a plain filename", () => {
    expect(contentDisposition("inline", "resume.pdf")).toBe(
      `inline; filename="resume.pdf"; filename*=UTF-8''resume.pdf`
    )
  })

  it("builds an attachment header", () => {
    expect(contentDisposition("attachment", "resume.pdf")).toBe(
      `attachment; filename="resume.pdf"; filename*=UTF-8''resume.pdf`
    )
  })

  it("strips CR and LF so a filename cannot split the response", () => {
    const header = contentDisposition("inline", `a${CR}${LF}X-Injected: 1${CR}${LF}${CR}${LF}b.pdf`)
    // The full string, not just the absence of CR/LF: an implementation that
    // truncated at the first CR, or dropped the name for the fallback, would
    // also contain no CR/LF and would also be wrong.
    expect(header).toBe(
      `inline; filename="aX-Injected1b.pdf"; filename*=UTF-8''aX-Injected%3A%201b.pdf`
    )
  })

  it("strips other control characters", () => {
    expect(contentDisposition("inline", `a${NUL}b${BEL}c.pdf`)).toBe(
      `inline; filename="abc.pdf"; filename*=UTF-8''abc.pdf`
    )
  })

  it("never emits an unescaped quote inside the ASCII parameter", () => {
    const header = contentDisposition("inline", 'a"; filename="evil.pdf')
    expect(asciiParam(header)).not.toContain('"')
    expect(header).not.toContain('"; filename="evil')
  })

  it("strips path separators from a traversing filename", () => {
    expect(contentDisposition("attachment", "../../etc/passwd")).toBe(
      `attachment; filename="....etcpasswd"; filename*=UTF-8''....etcpasswd`
    )
  })

  it("keeps a non-ASCII name in the RFC 5987 parameter and an ASCII fallback", () => {
    const header = contentDisposition("inline", "résumé señor.pdf")
    expect(/^[ -~]*$/.test(asciiParam(header))).toBe(true)
    expect(header).toContain("filename*=UTF-8''")
    expect(header).toContain("%C3%A9")
  })

  it("falls back to the caller's fallback when nothing survives sanitising", () => {
    expect(contentDisposition("inline", "文件", "resume.pdf")).toContain('filename="resume.pdf"')
    expect(contentDisposition("inline", "文件", "document.png")).toContain(
      'filename="document.png"'
    )
  })

  it("falls back to the caller's fallback for an empty filename", () => {
    expect(contentDisposition("inline", "", "resume.pdf")).toContain('filename="resume.pdf"')
  })

  it("falls back to a generic name when the caller names none", () => {
    // The fallback is the caller's concern, not this module's: it has no
    // business knowing whether a resume or a payslip asked.
    expect(contentDisposition("inline", "文件")).toContain('filename="download"')
    expect(contentDisposition("attachment", "")).toBe(
      `attachment; filename="download"; filename*=UTF-8''download`
    )
  })

  it("uses the fallback only where it is needed, keeping the real name in filename*", () => {
    // A non-ASCII name survives sanitising, so only the ASCII parameter — which
    // cannot carry it — falls back. Replacing both would throw away the one
    // parameter a modern browser actually reads.
    expect(contentDisposition("inline", "文件", "certificate.jpg")).toBe(
      `inline; filename="certificate.jpg"; filename*=UTF-8''%E6%96%87%E4%BB%B6`
    )
  })

  it("truncates a very long filename to exactly the cap", () => {
    // `toBeLessThanOrEqual(255)` also passes when the name is discarded
    // entirely, so assert the name that should survive.
    const capped = "a".repeat(255)
    expect(contentDisposition("inline", `${"a".repeat(500)}.pdf`)).toBe(
      `inline; filename="${capped}"; filename*=UTF-8''${capped}`
    )
  })

  it("percent-encodes characters that are not RFC 5987 attr-chars", () => {
    const header = contentDisposition("inline", "it's (a) file*.pdf")
    const extended = header.slice(header.indexOf("filename*=UTF-8''") + "filename*=UTF-8''".length)
    expect(extended).toContain("%27")
    expect(extended).toContain("%28")
    expect(extended).toContain("%2A")
  })
})

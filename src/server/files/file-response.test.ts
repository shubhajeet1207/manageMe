import { describe, expect, it } from "vitest"
import { fileResponse } from "./file-response"

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7])

function build(overrides: Partial<Parameters<typeof fileResponse>[0]> = {}) {
  return fileResponse({
    bytes: BYTES,
    storedContentType: "application/pdf",
    filename: "offer letter.pdf",
    fallbackFilename: "document.pdf",
    download: false,
    ...overrides,
  })
}

describe("fileResponse", () => {
  it("serves a known type with its literal registry Content-Type, inline", () => {
    const response = build()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/pdf")
    expect(response.headers.get("Content-Disposition")).toContain("inline")
  })

  it("looks the Content-Type up in the registry rather than echoing the stored string", () => {
    // A row written when the allow-list was wider must not be able to type its
    // own response — this is the §8.6 fail-closed path.
    const response = build({ storedContentType: "image/svg+xml" })
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream")
  })

  it("always serves an unknown stored type as an attachment", () => {
    const response = build({ storedContentType: "text/html", download: false })
    expect(response.headers.get("Content-Disposition")).toContain("attachment")
    expect(response.headers.get("Content-Disposition")).not.toContain("inline")
  })

  it("serves ?download=1 as an attachment even for a previewable type", () => {
    expect(build({ download: true }).headers.get("Content-Disposition")).toContain("attachment")
  })

  it("serves an image inline", () => {
    const response = build({ storedContentType: "image/png", filename: "scan.png" })
    expect(response.headers.get("Content-Type")).toBe("image/png")
    expect(response.headers.get("Content-Disposition")).toContain("inline")
  })

  it("generates the Content-Disposition rather than interpolating the filename", () => {
    const CR = String.fromCharCode(13)
    const LF = String.fromCharCode(10)
    const header = build({ filename: `a${CR}${LF}X-Injected: 1.pdf` }).headers.get(
      "Content-Disposition"
    )
    expect(header).not.toContain(CR)
    expect(header).not.toContain(LF)
  })

  it("uses the caller's fallback when nothing of the filename survives sanitising", () => {
    const header = build({ filename: "文件", fallbackFilename: "document.png" }).headers.get(
      "Content-Disposition"
    )
    expect(header).toContain('filename="document.png"')
  })

  it("sets nosniff, the CSP, CORP and a private no-store cache on a known type", () => {
    const response = build()
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Accept-Ranges")).toBe("none")
  })

  it("sets nosniff, the CSP, CORP and the cache header on the unknown-type branch too", () => {
    const response = build({ storedContentType: "application/x-msdownload" })
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Accept-Ranges")).toBe("none")
  })

  it("sandboxes every response an image decoder or a download will see", () => {
    for (const storedContentType of ["image/png", "image/jpeg", "image/webp", "text/html"]) {
      expect(build({ storedContentType }).headers.get("Content-Security-Policy")).toBe(
        "default-src 'none'; sandbox"
      )
    }
  })

  it("sets Content-Length from the buffer, not from a row's stored size", () => {
    const response = build()
    expect(response.headers.get("Content-Length")).toBe(String(BYTES.byteLength))
  })

  it("returns the bytes themselves", async () => {
    const body = new Uint8Array(await build().arrayBuffer())
    expect(Array.from(body)).toEqual(Array.from(BYTES))
  })
})

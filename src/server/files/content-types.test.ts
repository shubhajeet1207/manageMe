import { describe, expect, it } from "vitest"
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  RESUME_CONTENT_TYPES,
  findContentType,
  validateUpload,
  type ContentTypeSpec,
} from "./content-types"

/** A buffer of `size` bytes whose head is the spec's signatures — the smallest
 *  thing that is a valid file of that type as far as §8.3 is concerned. */
function bytesFor(spec: ContentTypeSpec, size?: number): Uint8Array {
  const needed = Math.max(
    ...spec.signatures.map((signature) => signature.offset + signature.bytes.length)
  )
  const bytes = new Uint8Array(Math.max(size ?? needed + 8, needed))
  for (const signature of spec.signatures) {
    bytes.set(signature.bytes, signature.offset)
  }
  return bytes
}

function specFor(contentType: string): ContentTypeSpec {
  const spec = DOCUMENT_CONTENT_TYPES.find((entry) => entry.contentType === contentType)
  if (!spec) throw new Error(`No registry entry for ${contentType}`)
  return spec
}

const HTML_BYTES = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>")

describe("the registry", () => {
  it("holds exactly the four allow-listed types (§8.1)", () => {
    expect(DOCUMENT_CONTENT_TYPES.map((spec) => spec.contentType)).toEqual([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ])
  })

  it("does not contain image/svg+xml — removing this assertion must be deliberate (§8.2)", () => {
    expect(findContentType("image/svg+xml")).toBeUndefined()
  })

  it("does not contain text/html — removing this assertion must be deliberate (§8.2)", () => {
    expect(findContentType("text/html")).toBeUndefined()
  })

  it("gives every entry at least one signature: bytes are the admission rule (§8.1)", () => {
    for (const spec of DOCUMENT_CONTENT_TYPES) {
      expect(spec.signatures.length).toBeGreaterThan(0)
    }
  })

  it("keeps every extension inside SAFE_KEY's one-dot alphanumeric shape (§8.4)", () => {
    for (const spec of DOCUMENT_CONTENT_TYPES) {
      expect(spec.extension).toMatch(/^\.[A-Za-z0-9]+$/)
    }
  })

  it("restricts RESUME_CONTENT_TYPES to PDF, so widening the vault cannot widen resume uploads", () => {
    expect(RESUME_CONTENT_TYPES.map((spec) => spec.contentType)).toEqual(["application/pdf"])
  })

  it("finds a known type and returns undefined for an unknown one", () => {
    expect(findContentType("image/png")?.extension).toBe(".png")
    expect(findContentType("application/x-msdownload")).toBeUndefined()
  })

  it("gives each type a preview mode the §8.9 dispatcher understands", () => {
    expect(specFor("application/pdf").previewMode).toBe("pdf")
    expect(specFor("image/png").previewMode).toBe("image")
    expect(specFor("image/jpeg").previewMode).toBe("image")
    expect(specFor("image/webp").previewMode).toBe("image")
  })

  it("caps uploads at 10MB for the whole application", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_UPLOAD_MB).toBe(10)
  })
})

describe.each(DOCUMENT_CONTENT_TYPES)("validateUpload for $contentType", (spec) => {
  it("accepts its own bytes under its own declared type", () => {
    const bytes = bytesFor(spec, 1024)
    expect(validateUpload(bytes, spec.contentType, bytes.byteLength, DOCUMENT_CONTENT_TYPES)).toEqual({
      ok: true,
      spec,
    })
  })

  it("rejects an HTML document declared as this type", () => {
    expect(
      validateUpload(HTML_BYTES, spec.contentType, HTML_BYTES.byteLength, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "signature-mismatch" })
  })

  it("rejects a buffer truncated below its signature", () => {
    const full = bytesFor(spec)
    const truncated = full.slice(0, 2)
    expect(
      validateUpload(truncated, spec.contentType, truncated.byteLength, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "signature-mismatch" })
  })

  it("rejects every other entry's bytes declared as this type (§8.3 control 3)", () => {
    for (const other of DOCUMENT_CONTENT_TYPES) {
      if (other.contentType === spec.contentType) continue
      const bytes = bytesFor(other, 512)
      expect(
        validateUpload(bytes, spec.contentType, bytes.byteLength, DOCUMENT_CONTENT_TYPES)
      ).toEqual({ ok: false, reason: "signature-mismatch" })
    }
  })

  it("rejects its own bytes when the type is not in the allowed list", () => {
    const bytes = bytesFor(spec, 256)
    const allowed = DOCUMENT_CONTENT_TYPES.filter((entry) => entry.contentType !== spec.contentType)
    expect(validateUpload(bytes, spec.contentType, bytes.byteLength, allowed)).toEqual({
      ok: false,
      reason: "wrong-type",
    })
  })
})

describe("validateUpload — the shared checks", () => {
  it("rejects an empty buffer", () => {
    expect(validateUpload(new Uint8Array(0), "application/pdf", 0, DOCUMENT_CONTENT_TYPES)).toEqual({
      ok: false,
      reason: "empty",
    })
  })

  it("rejects a declared type that is in no registry entry", () => {
    const bytes = bytesFor(specFor("image/png"), 64)
    expect(
      validateUpload(bytes, "image/svg+xml", bytes.byteLength, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "wrong-type" })
  })

  it("accepts exactly MAX_UPLOAD_BYTES", () => {
    const bytes = bytesFor(specFor("application/pdf"), MAX_UPLOAD_BYTES)
    expect(
      validateUpload(bytes, "application/pdf", bytes.byteLength, DOCUMENT_CONTENT_TYPES).ok
    ).toBe(true)
  })

  it("rejects MAX_UPLOAD_BYTES + 1", () => {
    const bytes = bytesFor(specFor("application/pdf"), MAX_UPLOAD_BYTES + 1)
    expect(
      validateUpload(bytes, "application/pdf", bytes.byteLength, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects an oversized declared size even when the bytes are small", () => {
    const bytes = bytesFor(specFor("application/pdf"), 1024)
    expect(
      validateUpload(bytes, "application/pdf", MAX_UPLOAD_BYTES + 1, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects a RIFF container whose fourth word is WAVE rather than WEBP", () => {
    // The multi-signature case that motivates `signatures` being a list: RIFF
    // alone is shared with WAV and AVI.
    const bytes = new Uint8Array(64)
    bytes.set(new TextEncoder().encode("RIFF"), 0)
    bytes.set(new TextEncoder().encode("WAVE"), 8)
    expect(validateUpload(bytes, "image/webp", bytes.byteLength, DOCUMENT_CONTENT_TYPES)).toEqual({
      ok: false,
      reason: "signature-mismatch",
    })
  })

  it("rejects a WEBP marker that sits anywhere but offset 8", () => {
    const bytes = new Uint8Array(64)
    bytes.set(new TextEncoder().encode("RIFF"), 0)
    bytes.set(new TextEncoder().encode("WEBP"), 12)
    expect(validateUpload(bytes, "image/webp", bytes.byteLength, DOCUMENT_CONTENT_TYPES)).toEqual({
      ok: false,
      reason: "signature-mismatch",
    })
  })

  it("rejects a ZIP — and therefore a DOCX — under every allowed type", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00])
    for (const spec of DOCUMENT_CONTENT_TYPES) {
      expect(
        validateUpload(bytes, spec.contentType, bytes.byteLength, DOCUMENT_CONTENT_TYPES)
      ).toEqual({ ok: false, reason: "signature-mismatch" })
    }
  })

  it("rejects a PDF whose %PDF- appears after offset 0", () => {
    const bytes = new TextEncoder().encode("\n%PDF-1.7")
    expect(
      validateUpload(bytes, "application/pdf", bytes.byteLength, DOCUMENT_CONTENT_TYPES)
    ).toEqual({ ok: false, reason: "signature-mismatch" })
  })
})

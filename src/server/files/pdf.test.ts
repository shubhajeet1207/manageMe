import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES, PDF_CONTENT_TYPE, validatePdfUpload } from "./pdf"

const PDF_HEADER = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n")

function pdfOfSize(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(PDF_HEADER.slice(0, Math.min(PDF_HEADER.length, size)))
  return bytes
}

describe("validatePdfUpload", () => {
  it("accepts a real PDF declared as application/pdf", () => {
    const bytes = pdfOfSize(1024)
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({ ok: true })
  })

  it("rejects an HTML document declared as application/pdf", () => {
    // The exact §8.2 threat: a forged MIME type on a file a browser would
    // happily render as markup on our own origin.
    const bytes = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>")
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "not-a-pdf",
    })
  })

  it("rejects a ZIP (and therefore a DOCX) declared as application/pdf", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "not-a-pdf",
    })
  })

  it("rejects a PNG declared as application/pdf", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "not-a-pdf",
    })
  })

  it("rejects a file whose %PDF- appears after offset 0", () => {
    const bytes = new TextEncoder().encode("\n%PDF-1.7")
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "not-a-pdf",
    })
  })

  it("rejects an empty buffer", () => {
    expect(validatePdfUpload(new Uint8Array(0), PDF_CONTENT_TYPE, 0)).toEqual({
      ok: false,
      reason: "empty",
    })
  })

  it("rejects a buffer shorter than the magic number", () => {
    const bytes = new TextEncoder().encode("%PD")
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "not-a-pdf",
    })
  })

  it("rejects a declared content type that is not application/pdf", () => {
    const bytes = pdfOfSize(1024)
    expect(validatePdfUpload(bytes, "text/html", bytes.byteLength)).toEqual({
      ok: false,
      reason: "wrong-type",
    })
  })

  it("accepts exactly MAX_UPLOAD_BYTES", () => {
    const bytes = pdfOfSize(MAX_UPLOAD_BYTES)
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({ ok: true })
  })

  it("rejects MAX_UPLOAD_BYTES + 1", () => {
    const bytes = pdfOfSize(MAX_UPLOAD_BYTES + 1)
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, bytes.byteLength)).toEqual({
      ok: false,
      reason: "too-large",
    })
  })

  it("rejects an oversized declared size even when the bytes are small", () => {
    // A lying declaredSize must not talk its way past the cap in either
    // direction; the real byte length is checked as well.
    const bytes = pdfOfSize(1024)
    expect(validatePdfUpload(bytes, PDF_CONTENT_TYPE, MAX_UPLOAD_BYTES + 1)).toEqual({
      ok: false,
      reason: "too-large",
    })
  })

  it("caps uploads at 10MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })
})

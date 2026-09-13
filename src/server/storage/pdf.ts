/**
 * Upload validation for PDFs (§8.2, §8.3).
 *
 * No Prisma, no `fs`, no framework import — this file is a pure unit-test
 * target, and it is the single home of the size limit so the client form and
 * the server cannot drift apart.
 */

export const PDF_CONTENT_TYPE = "application/pdf"

/** 10MB. `next.config.ts` sets a 12mb body limit deliberately above this, so
 *  an 10.5MB file produces our field error rather than the framework's opaque
 *  body-size failure. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** `%PDF-` at offset 0. A real PDF starts here; HTML, ZIP, PNG and a shell
 *  script do not. This is the check that actually decides. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const

export type PdfRejectionReason = "empty" | "too-large" | "wrong-type" | "not-a-pdf"

export type PdfValidationResult = { ok: true } | { ok: false; reason: PdfRejectionReason }

/**
 * `declaredType` and `declaredSize` are client claims, not evidence; `bytes`
 * is the truth. All three are checked because the cheap checks reject the
 * honest mistake with a better message, and the magic-byte check rejects the
 * dishonest one.
 *
 * We stop at the five-byte header on purpose: full validation means embedding
 * a PDF parser, and a parser is a larger piece of attack surface than the
 * check would close.
 */
export function validatePdfUpload(
  bytes: Uint8Array,
  declaredType: string,
  declaredSize: number
): PdfValidationResult {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" }

  // Both numbers are checked: `declaredSize` is what the framework parsed,
  // `byteLength` is what we actually hold. Either being over the cap is a no.
  if (bytes.byteLength > MAX_UPLOAD_BYTES || declaredSize > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too-large" }
  }

  if (declaredType !== PDF_CONTENT_TYPE) return { ok: false, reason: "wrong-type" }

  if (bytes.byteLength < PDF_MAGIC.length) return { ok: false, reason: "not-a-pdf" }
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return { ok: false, reason: "not-a-pdf" }
  }

  return { ok: true }
}

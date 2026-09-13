/**
 * Upload validation for PDFs — now a thin wrapper over the content-type
 * registry in `content-types.ts` (Phase 4 §5.2).
 *
 * This file stays, with the same exports and the same behaviour, so
 * `resume-service.ts`, `upload-version-sheet.tsx`, the resume route and
 * `pdf.test.ts` change not one character. It passes `RESUME_CONTENT_TYPES`
 * rather than the vault's list, which is what keeps the resume path PDF-only:
 * **widening the vault's allow-list must not widen the resume upload's.**
 */

import { RESUME_CONTENT_TYPES, validateUpload } from "./content-types"

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, PDF_CONTENT_TYPE } from "./content-types"

export type PdfRejectionReason = "empty" | "too-large" | "wrong-type" | "not-a-pdf"

export type PdfValidationResult = { ok: true } | { ok: false; reason: PdfRejectionReason }

/**
 * `declaredType` and `declaredSize` are client claims, not evidence; `bytes` is
 * the truth. All three are checked because the cheap checks reject the honest
 * mistake with a better message, and the signature check rejects the dishonest
 * one.
 */
export function validatePdfUpload(
  bytes: Uint8Array,
  declaredType: string,
  declaredSize: number
): PdfValidationResult {
  const result = validateUpload(bytes, declaredType, declaredSize, RESUME_CONTENT_TYPES)
  if (result.ok) return { ok: true }
  // The registry calls it a signature mismatch; this path has only one
  // signature, so its callers' message stays "not a PDF".
  const reason = result.reason === "signature-mismatch" ? "not-a-pdf" : result.reason
  return { ok: false, reason }
}

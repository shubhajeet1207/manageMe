/**
 * The content-type registry (§8.1, §8.3) — the single place that decides what
 * the application will accept, what it names the bytes on disk, and how the UI
 * is allowed to show them.
 *
 * No Prisma, no `fs`, no framework import: a pure unit-test target, and the one
 * home of the size limit so the client form and the server cannot drift apart.
 *
 * **The admission rule: a type may only enter this list if its bytes identify
 * it.** The check that actually decides is the signature check, so a type it
 * cannot decide has no membership test at all — only a client-supplied string,
 * which is not evidence. That single rule refuses `text/plain`, `text/csv`,
 * `text/html`, `application/xml` and `image/svg+xml` together: a text file may
 * begin with anything, a BOM and the text of an attack included.
 *
 * SVG and HTML are refused a second time on their own merits (§8.2). They are
 * scripted document formats — an SVG is XML that can carry `<script>`,
 * `onload=` and `<foreignObject>` — and served from our own origin and opened
 * in a tab, that script runs with our origin's session. `nosniff` does not help
 * there: we would not be being tricked, we would have declared the type
 * ourselves.
 *
 * Adding a type later is a data change: one entry here, one `accept` string,
 * one preview mode, one test. It is deliberately not a config change, because
 * an allow-list an environment variable can widen is one an operator can widen
 * by accident.
 */

export type PreviewMode = "pdf" | "image" | "none"

export type ContentTypeSpec = {
  contentType: string
  /** The literal appended to a server-generated key. Never the client's.
   *  It may not contain a dot: `local-driver.ts`'s SAFE_KEY admits exactly one
   *  (§8.4), which is asserted in content-types.test.ts. */
  extension: string
  /** Every signature must match. WebP needs two; that is why this is a list. */
  signatures: readonly { offset: number; bytes: readonly number[] }[]
  previewMode: PreviewMode
  /** The lozenge shown in the table. */
  label: string
}

export const PDF_CONTENT_TYPE = "application/pdf"

const PDF: ContentTypeSpec = {
  contentType: PDF_CONTENT_TYPE,
  extension: ".pdf",
  // `%PDF-` at offset 0. A real PDF starts here; HTML, ZIP, PNG and a shell
  // script do not.
  signatures: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
  previewMode: "pdf",
  label: "PDF",
}

const PNG: ContentTypeSpec = {
  contentType: "image/png",
  extension: ".png",
  signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  previewMode: "image",
  label: "PNG",
}

const JPEG: ContentTypeSpec = {
  contentType: "image/jpeg",
  extension: ".jpg",
  // Three bytes, not four: the fourth varies across JFIF, Exif and SPIFF. These
  // are the SOI marker plus the first byte of the next, and no other allowed
  // type begins with them.
  signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  previewMode: "image",
  label: "JPEG",
}

const WEBP: ContentTypeSpec = {
  contentType: "image/webp",
  extension: ".webp",
  // `RIFF` alone is a container shared with WAV and AVI, which is exactly why a
  // registry entry holds a list of signatures that must all match.
  signatures: [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  previewMode: "image",
  label: "WebP",
}

/** What the document vault accepts. */
export const DOCUMENT_CONTENT_TYPES: readonly ContentTypeSpec[] = [PDF, PNG, JPEG, WEBP]

/** What a resume upload accepts, which is PDF and stays PDF. It exists so that
 *  widening the vault cannot widen resume uploads by accident. */
export const RESUME_CONTENT_TYPES: readonly ContentTypeSpec[] = [PDF]

/** Every type this application has ever been willing to write, for the serving
 *  lookup in §8.6. A stored type that is not here fails closed. */
const KNOWN_CONTENT_TYPES: readonly ContentTypeSpec[] = DOCUMENT_CONTENT_TYPES

/** 10MB, one cap for the whole application. `next.config.ts` sets both body
 *  limits deliberately above this, so a 10.5MB file produces our field error
 *  rather than a framework failure or a silently truncated success (§8.5). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024

export type UploadRejectionReason = "empty" | "too-large" | "wrong-type" | "signature-mismatch"

export type UploadValidationResult =
  | { ok: true; spec: ContentTypeSpec }
  | { ok: false; reason: UploadRejectionReason }

/** The registry lookup behind §8.6's `Content-Type`. Returns undefined for a
 *  stored value the allow-list no longer knows, which is what makes removing a
 *  type retroactive rather than forward-only. */
export function findContentType(contentType: string): ContentTypeSpec | undefined {
  return KNOWN_CONTENT_TYPES.find((spec) => spec.contentType === contentType)
}

function matchesSignatures(bytes: Uint8Array, spec: ContentTypeSpec): boolean {
  return spec.signatures.every((signature) => {
    if (bytes.byteLength < signature.offset + signature.bytes.length) return false
    return signature.bytes.every((byte, index) => bytes[signature.offset + index] === byte)
  })
}

/**
 * §8.3's four controls, in order.
 *
 * `declaredType` and `declaredSize` are client claims, not evidence; `bytes` is
 * the truth. The cheap checks reject the honest mistake with a better message,
 * and the signature check rejects the dishonest one.
 *
 * The declared type and the matched signature must AGREE: a file declared
 * `image/png` whose bytes are a PDF is rejected rather than silently re-typed,
 * because a row whose `contentType` disagrees with what the uploader believes
 * is how content-type confusion starts.
 *
 * We stop at the signature on purpose. Full validation means embedding a parser
 * per format, and a parser is a larger piece of attack surface than the check
 * would close. Nothing on the server ever renders or interprets these bytes.
 */
export function validateUpload(
  bytes: Uint8Array,
  declaredType: string,
  declaredSize: number,
  allowed: readonly ContentTypeSpec[]
): UploadValidationResult {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" }

  // Both numbers: `declaredSize` is what the framework parsed, `byteLength` is
  // what we actually hold. Either being over the cap is a no.
  if (bytes.byteLength > MAX_UPLOAD_BYTES || declaredSize > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too-large" }
  }

  const spec = allowed.find((entry) => entry.contentType === declaredType)
  if (!spec) return { ok: false, reason: "wrong-type" }

  if (!matchesSignatures(bytes, spec)) return { ok: false, reason: "signature-mismatch" }

  return { ok: true, spec }
}

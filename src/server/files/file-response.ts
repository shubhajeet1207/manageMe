import { contentDisposition } from "./content-disposition"
import { findContentType, type PreviewMode } from "./content-types"

/**
 * The §8.6 header set, in one function, used by BOTH file-serving routes.
 * The day a header needs adding, one file should change rather than two.
 */

const FALLBACK_CONTENT_TYPE = "application/octet-stream"

/**
 * `sandbox` is defence in depth: even if a type ever slipped through the
 * allow-list, a sandboxed document with no permitted sources cannot run script
 * as us, load a subresource, or navigate.
 *
 * It is keyed by preview mode rather than special-cased at a call site, because
 * §8.6 records an open question about it: some browsers have historically
 * refused to render a sandboxed PDF in their built-in viewer. If one does, the
 * resolution is to drop `sandbox` for the "pdf" entry alone and keep the full
 * header everywhere else — never to drop the header.
 */
const CSP_BY_PREVIEW_MODE: Record<PreviewMode, string> = {
  pdf: "default-src 'none'; sandbox",
  image: "default-src 'none'; sandbox",
  none: "default-src 'none'; sandbox",
}

export type FileResponseOptions = {
  bytes: Uint8Array
  /** The row's stored type. Looked up in the registry, never echoed back. */
  storedContentType: string
  /** The user-supplied display filename. Never interpolated into the header. */
  filename: string
  /** What the disposition falls back to when nothing of `filename` survives. */
  fallbackFilename: string
  download: boolean
}

export function fileResponse({
  bytes,
  storedContentType,
  filename,
  fallbackFilename,
  download,
}: FileResponseOptions): Response {
  const spec = findContentType(storedContentType)

  // Fail closed. `storedContentType` is a string in a database that may have
  // been written when the allow-list was wider, so a type the registry no
  // longer knows is served as an opaque download, never rendered — which is
  // what makes removing a type retroactively defuse every row that used it.
  const previewable = spec !== undefined && spec.previewMode !== "none"
  const disposition = download || !previewable ? "attachment" : "inline"

  // Re-wrapped because the driver's Uint8Array is generic over ArrayBufferLike
  // (it may be a SharedArrayBuffer for all the type knows) and BodyInit is not.
  // A copy is irrelevant against a 10MB ceiling and beats a cast.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": spec?.contentType ?? FALLBACK_CONTENT_TYPE,
      // Stops the browser sniffing the body as HTML whatever it contains.
      // Still the single most important header here.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": CSP_BY_PREVIEW_MODE[spec?.previewMode ?? "none"],
      // Another site cannot embed the bytes as an image. Auth.js's SameSite=Lax
      // cookie already blocks the cross-site request; this costs nothing and
      // does not depend on that.
      "Cross-Origin-Resource-Policy": "same-origin",
      // Generated, never interpolated: the filename is user-supplied text going
      // into a header, which is a header-injection vector.
      "Content-Disposition": contentDisposition(disposition, filename, fallbackFilename),
      // An ID proof must never sit in a shared cache.
      "Cache-Control": "private, no-store",
      // At a 10MB ceiling the object is one response; advertising ranges we do
      // not implement makes viewers retry.
      "Accept-Ranges": "none",
      // The buffer's length, not `sizeBytes` from the row — a mismatch would
      // truncate the response. The column is for display.
      "Content-Length": String(bytes.byteLength),
    },
  })
}

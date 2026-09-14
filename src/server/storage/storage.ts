/**
 * The storage abstraction for user-uploaded bytes.
 *
 * It is deliberately not resume-specific — it talks about keys and bytes, not
 * about resumes — because Phase 4's document vault reuses it rather than
 * inventing a second one, and because a Phase 7 cloud driver is meant to be a
 * new file plus one `case` in `getStorage()`.
 *
 * `Uint8Array` rather than `Buffer` so nothing in the interface is
 * Node-specific.
 */
export type SignedUrlOptions = {
  /** Forced on the signed response, so the browser is told the type the ROW
   *  says it is rather than whatever was stored. */
  contentType?: string
  /** A complete, already-escaped Content-Disposition value. Built by
   *  `contentDisposition()`, never interpolated from a raw filename. */
  disposition?: string
}

export interface StorageDriver {
  /** Write bytes at `key`, overwriting any existing object there. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Read bytes at `key`, or null if there is no such object. */
  get(key: string): Promise<Uint8Array | null>
  /** Delete `key`. Idempotent: resolves when the object is already absent. */
  remove(key: string): Promise<void>
  /**
   * A short-lived, driver-signed URL for `key`, or null when the driver
   * cannot sign one. The local driver always returns null — its objects are
   * outside the web root and have no addressable URL by design.
   */
  url(key: string, options?: SignedUrlOptions): Promise<string | null>
  /**
   * A short-lived URL the BROWSER may PUT bytes to directly, or null when the
   * driver cannot sign one (the local driver never can).
   *
   * This exists because of a platform limit, not a preference: Vercel caps a
   * serverless function's REQUEST body at 4.5MB, so an upload routed through a
   * Server Action cannot exceed it however `bodySizeLimit` is configured. Bytes
   * that never enter the function are not subject to the cap.
   *
   * A presigned PUT cannot enforce a size limit — S3 conditions are a POST-policy
   * feature — so the caller MUST verify size and magic bytes after the object
   * lands and delete it when it fails. Treat anything uploaded this way as
   * unverified until that check has run.
   */
  presignPut(key: string, contentType: string): Promise<string | null>
}

/**
 * Thrown when a key is not something the driver is willing to resolve to a
 * path. Every Phase 3 key is server-generated (§8.1 Control 1), so this should
 * never fire; it exists so that the day someone builds a key out of a
 * user-supplied filename, the driver refuses rather than complies.
 *
 * The message never contains the offending key: it would be echoed into logs
 * and, if it ever reached a client, would disclose server layout.
 */
/**
 * The whole key must match this: it admits no `.`-only segments, no backslash,
 * no NUL, no `%`, no whitespace, no leading `/`, and exactly one dot — the
 * extension's. `..` therefore cannot appear anywhere, because the middle
 * character class has no `.` in it.
 *
 * It lives here rather than in a driver because every driver needs the same
 * answer, and a second copy is a second thing to drift.
 */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_-]*\.[A-Za-z0-9]+$/

export function assertSafeStorageKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new UnsafeStorageKeyError()
  const segments = key.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new UnsafeStorageKeyError()
  }
}

export class UnsafeStorageKeyError extends Error {
  constructor() {
    super("Unsafe storage key")
    this.name = "UnsafeStorageKeyError"
  }
}

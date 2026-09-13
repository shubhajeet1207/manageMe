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
  url(key: string): Promise<string | null>
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
export class UnsafeStorageKeyError extends Error {
  constructor() {
    super("Unsafe storage key")
    this.name = "UnsafeStorageKeyError"
  }
}

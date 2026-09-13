import { createHash } from "node:crypto"

/**
 * Where `CREDENTIALS_KEY` is read, validated and turned into a key id, and the
 * only place in the app that touches it. Like `secret-box.ts`, this file makes
 * no `console` call anywhere: nothing in it can print key material.
 *
 * There is NO fallback of any kind — not `AUTH_SECRET`, not a build-time
 * default, not a random per-process key, and above all not "store the plaintext
 * and carry on". A missing or malformed key throws, and the three secret
 * columns are non-nullable, so a row holding a plaintext secret is not a state
 * the schema can reach.
 */

const KEY_BYTES = 32
const KEY_ID_BYTES = 8
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export type CredentialsKey = {
  key: Uint8Array
  keyId: string
}

/** Fixed message. It names the variable and carries no value, because an error
 *  that echoed the environment is how key material reaches a log aggregator. */
export class CredentialsKeyUnavailableError extends Error {
  constructor() {
    super("Credential storage isn't configured.")
    this.name = "CredentialsKeyUnavailableError"
  }
}

/**
 * The first 8 bytes of SHA-256 over the key, hex. Derived from the only thing
 * that matters, so it cannot drift the way a hand-maintained version number
 * can, and 64 bits of a hash over a 256-bit key is not a practical oracle.
 */
export function computeKeyId(key: Uint8Array): string {
  return createHash("sha256").update(key).digest("hex").slice(0, KEY_ID_BYTES * 2)
}

/** The specific reason is logged server-side by the caller's own layer at most;
 *  the client only ever sees `CredentialsKeyUnavailableError`. */
function decodeOrThrow(raw: string): Uint8Array {
  const trimmed = raw.trim()
  if (!BASE64.test(trimmed)) throw new CredentialsKeyUnavailableError()

  const decoded = Buffer.from(trimmed, "base64")
  // Node's base64 decoder skips characters it does not recognise, so a
  // re-encode is what actually proves the input was base64 rather than
  // something that happened to contain base64 characters.
  if (decoded.toString("base64").replace(/=+$/, "") !== trimmed.replace(/=+$/, "")) {
    throw new CredentialsKeyUnavailableError()
  }
  if (decoded.byteLength !== KEY_BYTES) throw new CredentialsKeyUnavailableError()

  return new Uint8Array(decoded)
}

// Keyed on the raw environment string rather than a plain boolean, so the
// derived key can never outlive the value it came from — which is what makes
// the module testable without a reset hook the production path would also have.
let currentCache: { raw: string; value: CredentialsKey } | null = null
let previousCache: { raw: string; value: CredentialsKey } | null = null

function load(raw: string): CredentialsKey {
  const key = decodeOrThrow(raw)
  return { key, keyId: computeKeyId(key) }
}

export function getCredentialsKey(): CredentialsKey {
  const raw = process.env.CREDENTIALS_KEY
  if (!raw) throw new CredentialsKeyUnavailableError()

  // The most likely configuration mistake is a copy-paste of AUTH_SECRET, and
  // sharing one secret between session signing and vault encryption welds two
  // unrelated blast radii together in both directions (§9.2).
  if (raw === process.env.AUTH_SECRET) throw new CredentialsKeyUnavailableError()

  if (currentCache?.raw !== raw) currentCache = { raw, value: load(raw) }
  return currentCache.value
}

/** Decrypt-only, and only during a rotation. Absent is a normal state; present
 *  and malformed is not, and throws rather than being quietly ignored. */
export function getPreviousCredentialsKey(): CredentialsKey | null {
  const raw = process.env.CREDENTIALS_KEY_PREVIOUS
  if (!raw) return null

  if (previousCache?.raw !== raw) previousCache = { raw, value: load(raw) }
  return previousCache.value
}

/**
 * Which key a stored row needs: current, else previous, else none. Returning
 * null rather than throwing lets the service raise the row-level "encrypted
 * with a different key" message instead of taking the whole page down.
 */
export function resolveKeyById(keyId: string): Uint8Array | null {
  const current = getCredentialsKey()
  if (current.keyId === keyId) return current.key

  const previous = getPreviousCredentialsKey()
  if (previous?.keyId === keyId) return previous.key

  return null
}

export function isCredentialsKeyConfigured(): boolean {
  try {
    getCredentialsKey()
    return true
  } catch {
    return false
  }
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM, and nothing else. This file imports `node:crypto` and nothing
 * else — no Prisma, no `fs`, no framework, no `console` — so it is a pure unit
 * test target and so nothing in it can print key material or plaintext.
 *
 * The key is a PARAMETER rather than something this module reads from the
 * environment. `credentials-key.ts` owns the environment; keeping the two apart
 * is what lets the tests seal under one key and try to open under another, which
 * is the property §9.11 asks for and the one a module that resolved its own key
 * could not demonstrate.
 */

const ALGORITHM = "aes-256-gcm"
const KEY_BYTES = 32
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16

/** The AAD shape. `v1` means a future change to it is detectable rather than
 *  silently breaking every row. */
const AAD_PREFIX = "credential:v1:"

/** Explicitly ArrayBuffer-backed rather than the wider `ArrayBufferLike`, so
 *  these values drop straight into a Prisma `Bytes` column without a cast. */
export type SecretBytes = Uint8Array<ArrayBuffer>

export type SealedSecret = {
  ciphertext: SecretBytes
  nonce: SecretBytes
  authTag: SecretBytes
}

/**
 * Fixed message, no interpolation. Every failure — a wrong key, a flipped byte,
 * another user's AAD, a key of the wrong length — surfaces as this one error,
 * because a message that named the input is how a plaintext reaches a log.
 */
export class SecretOpenError extends Error {
  constructor() {
    super("Could not open the sealed secret")
    this.name = "SecretOpenError"
  }
}

function assertKeyLength(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) throw new SecretOpenError()
}

function aad(userId: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}${userId}`, "utf8")
}

export function seal(plaintext: string, userId: string, key: Uint8Array): SealedSecret {
  assertKeyLength(key)

  // Generated here, on every call. There is no parameter that lets a caller
  // supply a nonce and no path that reads a stored one back into an
  // encryption: under GCM, reusing a nonce with the same key is a break, not a
  // weakness.
  const nonce = randomBytes(NONCE_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES })
  cipher.setAAD(aad(userId))

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(cipher.getAuthTag()),
  }
}

export function open(sealed: SealedSecret, userId: string, key: Uint8Array): string {
  assertKeyLength(key)
  if (sealed.nonce.byteLength !== NONCE_BYTES) throw new SecretOpenError()
  if (sealed.authTag.byteLength !== AUTH_TAG_BYTES) throw new SecretOpenError()

  try {
    const decipher = createDecipheriv(ALGORITHM, key, sealed.nonce, {
      authTagLength: AUTH_TAG_BYTES,
    })
    decipher.setAAD(aad(userId))
    decipher.setAuthTag(sealed.authTag)

    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8")
  } catch {
    throw new SecretOpenError()
  }
}

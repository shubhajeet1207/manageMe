import { randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  CredentialsKeyUnavailableError,
  computeKeyId,
  getCredentialsKey,
  getPreviousCredentialsKey,
  resolveKeyById,
} from "./credentials-key"

const originalKey = process.env.CREDENTIALS_KEY
const originalPrevious = process.env.CREDENTIALS_KEY_PREVIOUS
const originalAuthSecret = process.env.AUTH_SECRET

function base64Key(): string {
  return randomBytes(32).toString("base64")
}

beforeEach(() => {
  process.env.AUTH_SECRET = "an-auth-secret-that-is-not-the-credentials-key"
  delete process.env.CREDENTIALS_KEY_PREVIOUS
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.CREDENTIALS_KEY
  else process.env.CREDENTIALS_KEY = originalKey
  if (originalPrevious === undefined) delete process.env.CREDENTIALS_KEY_PREVIOUS
  else process.env.CREDENTIALS_KEY_PREVIOUS = originalPrevious
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = originalAuthSecret
})

describe("getCredentialsKey", () => {
  it("decodes 32 base64 bytes and derives a stable key id", () => {
    const raw = base64Key()
    process.env.CREDENTIALS_KEY = raw

    const first = getCredentialsKey()
    const second = getCredentialsKey()

    expect(first.key).toHaveLength(32)
    expect(first.keyId).toMatch(/^[0-9a-f]{16}$/)
    expect(second.keyId).toBe(first.keyId)
  })

  it("gives two different keys two different key ids", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    const first = getCredentialsKey().keyId
    process.env.CREDENTIALS_KEY = base64Key()
    const second = getCredentialsKey().keyId

    expect(second).not.toBe(first)
  })

  it("throws when the variable is unset", () => {
    delete process.env.CREDENTIALS_KEY
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("throws when the variable is empty", () => {
    process.env.CREDENTIALS_KEY = ""
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("throws when the value is not base64", () => {
    process.env.CREDENTIALS_KEY = "not base64 at all !!!"
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("throws when the decoded key is 31 bytes", () => {
    process.env.CREDENTIALS_KEY = randomBytes(31).toString("base64")
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("throws when the decoded key is 33 bytes", () => {
    process.env.CREDENTIALS_KEY = randomBytes(33).toString("base64")
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("throws when the key is a copy of AUTH_SECRET", () => {
    const raw = base64Key()
    process.env.CREDENTIALS_KEY = raw
    process.env.AUTH_SECRET = raw
    expect(() => getCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })

  it("carries no key material or environment value in its message", () => {
    const raw = base64Key()
    process.env.CREDENTIALS_KEY = raw
    process.env.AUTH_SECRET = raw

    try {
      getCredentialsKey()
      expect.unreachable("expected a throw")
    } catch (error) {
      const message = (error as Error).message
      expect(message).toBe("Credential storage isn't configured.")
      expect(message).not.toContain(raw)
    }
  })
})

describe("computeKeyId", () => {
  it("is the first 8 bytes of SHA-256 over the key, hex", () => {
    const key = new Uint8Array(32)
    // SHA-256 of 32 zero bytes.
    expect(computeKeyId(key)).toBe("66687aadf862bd77")
  })
})

describe("getPreviousCredentialsKey", () => {
  it("is null when the variable is unset", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    expect(getPreviousCredentialsKey()).toBeNull()
  })

  it("is null when the variable is empty", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    process.env.CREDENTIALS_KEY_PREVIOUS = ""
    expect(getPreviousCredentialsKey()).toBeNull()
  })

  it("throws when the previous key is set but malformed", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    process.env.CREDENTIALS_KEY_PREVIOUS = randomBytes(16).toString("base64")
    expect(() => getPreviousCredentialsKey()).toThrow(CredentialsKeyUnavailableError)
  })
})

describe("resolveKeyById", () => {
  it("resolves the current key", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    const { keyId, key } = getCredentialsKey()
    expect(resolveKeyById(keyId)).toEqual(key)
  })

  it("resolves the previous key during a rotation", () => {
    const previous = base64Key()
    process.env.CREDENTIALS_KEY = base64Key()
    process.env.CREDENTIALS_KEY_PREVIOUS = previous

    const previousKeyId = computeKeyId(new Uint8Array(Buffer.from(previous, "base64")))
    expect(resolveKeyById(previousKeyId)).toEqual(
      new Uint8Array(Buffer.from(previous, "base64"))
    )
  })

  it("returns null for a key id neither variable holds", () => {
    process.env.CREDENTIALS_KEY = base64Key()
    const stranger = computeKeyId(new Uint8Array(randomBytes(32)))
    expect(resolveKeyById(stranger)).toBeNull()
  })
})

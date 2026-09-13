import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { SecretOpenError, open, seal } from "./secret-box"

const KEY_A = new Uint8Array(randomBytes(32))
const KEY_B = new Uint8Array(randomBytes(32))
const USER_A = "user-a"
const USER_B = "user-b"

describe("seal / open round-trip", () => {
  it("returns the exact plaintext it was given", () => {
    const sealed = seal("correct horse battery staple", USER_A, KEY_A)
    expect(open(sealed, USER_A, KEY_A)).toBe("correct horse battery staple")
  })

  it("round-trips multi-byte UTF-8", () => {
    const plaintext = "pässwörd·日本語·🔐"
    const sealed = seal(plaintext, USER_A, KEY_A)
    expect(open(sealed, USER_A, KEY_A)).toBe(plaintext)
  })

  it("produces a 12-byte nonce and a 16-byte auth tag", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    expect(sealed.nonce).toHaveLength(12)
    expect(sealed.authTag).toHaveLength(16)
  })

  it("never emits the plaintext inside the ciphertext", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    expect(Buffer.from(sealed.ciphertext).toString("utf8")).not.toContain("hunter2")
    expect(Buffer.from(sealed.ciphertext).toString("latin1")).not.toContain("hunter2")
  })
})

describe("a different key does not open", () => {
  it("throws rather than returning plausible garbage", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    expect(() => open(sealed, USER_A, KEY_B)).toThrow(SecretOpenError)
  })

  it("throws for a key of the wrong length rather than truncating it", () => {
    expect(() => seal("hunter2", USER_A, new Uint8Array(randomBytes(31)))).toThrow(SecretOpenError)
  })
})

describe("tampering is detected by the auth tag", () => {
  it("throws when a ciphertext byte is flipped", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    const ciphertext = Uint8Array.from(sealed.ciphertext)
    ciphertext[0] ^= 0x01
    expect(() => open({ ...sealed, ciphertext }, USER_A, KEY_A)).toThrow(SecretOpenError)
  })

  it("throws when an auth-tag byte is flipped", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    const authTag = Uint8Array.from(sealed.authTag)
    authTag[0] ^= 0x01
    expect(() => open({ ...sealed, authTag }, USER_A, KEY_A)).toThrow(SecretOpenError)
  })

  it("throws when a nonce byte is flipped", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    const nonce = Uint8Array.from(sealed.nonce)
    nonce[0] ^= 0x01
    expect(() => open({ ...sealed, nonce }, USER_A, KEY_A)).toThrow(SecretOpenError)
  })

  it("throws when the ciphertext is truncated", () => {
    const sealed = seal("a longer password than one block", USER_A, KEY_A)
    const ciphertext = sealed.ciphertext.slice(0, sealed.ciphertext.length - 1)
    expect(() => open({ ...sealed, ciphertext }, USER_A, KEY_A)).toThrow(SecretOpenError)
  })
})

describe("the AAD binds a record to its owner", () => {
  it("does not open a row copied from one user onto another", () => {
    const sealed = seal("hunter2", USER_A, KEY_A)
    expect(() => open(sealed, USER_B, KEY_A)).toThrow(SecretOpenError)
  })
})

describe("nonce uniqueness", () => {
  it("gives two encryptions of the same plaintext different nonces and ciphertexts", () => {
    const first = seal("hunter2", USER_A, KEY_A)
    const second = seal("hunter2", USER_A, KEY_A)

    expect(Buffer.from(first.nonce).toString("hex")).not.toBe(
      Buffer.from(second.nonce).toString("hex")
    )
    expect(Buffer.from(first.ciphertext).toString("hex")).not.toBe(
      Buffer.from(second.ciphertext).toString("hex")
    )
    expect(Buffer.from(first.authTag).toString("hex")).not.toBe(
      Buffer.from(second.authTag).toString("hex")
    )
  })

  it("never repeats a nonce across many encryptions", () => {
    const nonces = new Set<string>()
    for (let i = 0; i < 500; i += 1) {
      nonces.add(Buffer.from(seal("hunter2", USER_A, KEY_A).nonce).toString("hex"))
    }
    expect(nonces.size).toBe(500)
  })
})

import { randomBytes } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { hashPassword } from "@/lib/auth/password"
import { CredentialsKeyUnavailableError } from "@/server/crypto/credentials-key"
import * as credentialRepository from "@/server/repositories/credential-repository"
import {
  CredentialLabelTakenError,
  CredentialNotFoundError,
  CredentialTamperedError,
  CredentialUndecryptableError,
  InvalidAccountPasswordError,
  countCredentialsNeedingReencryption,
  createCredential,
  deleteCredential,
  getCredential,
  listCredentials,
  reencryptCredentials,
  revealCredential,
  updateCredential,
} from "./credential-service"

const ACCOUNT_PASSWORD = "correct horse battery staple"
const SECRET = "s3cr3t-portal-p@ssw0rd"

const originalKey = process.env.CREDENTIALS_KEY
const originalPrevious = process.env.CREDENTIALS_KEY_PREVIOUS

const createdUserIds: string[] = []
let hashed: string | null = null

function base64Key(): string {
  return randomBytes(32).toString("base64")
}

async function makeUser() {
  hashed ??= await hashPassword(ACCOUNT_PASSWORD)
  const user = await prisma.user.create({
    data: {
      name: "Credential Service Test",
      email: `cred-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: hashed,
    },
  })
  createdUserIds.push(user.id)
  return user
}

beforeEach(() => {
  process.env.CREDENTIALS_KEY = base64Key()
  delete process.env.CREDENTIALS_KEY_PREVIOUS
})

afterEach(async () => {
  if (createdUserIds.length > 0) {
    const ids = [...createdUserIds]
    createdUserIds.length = 0
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  }
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.CREDENTIALS_KEY
  else process.env.CREDENTIALS_KEY = originalKey
  if (originalPrevious === undefined) delete process.env.CREDENTIALS_KEY_PREVIOUS
  else process.env.CREDENTIALS_KEY_PREVIOUS = originalPrevious
})

describe("createCredential", () => {
  it("stores the secret as ciphertext and never as the plaintext", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    const sealed = await credentialRepository.findSealedById(user.id, created.id)
    const bytes = Buffer.from(sealed!.secretCiphertext)
    expect(bytes.toString("utf8")).not.toContain(SECRET)
    expect(bytes.toString("latin1")).not.toContain(SECRET)
    expect(sealed!.secretNonce).toHaveLength(12)
    expect(sealed!.secretAuthTag).toHaveLength(16)
    expect(sealed!.keyId).toMatch(/^[0-9a-f]{16}$/)
  })

  it("refuses a label the user already has", async () => {
    const user = await makeUser()
    await createCredential(user.id, { label: "Workday", secret: SECRET })

    await expect(
      createCredential(user.id, { label: "Workday", secret: SECRET })
    ).rejects.toBeInstanceOf(CredentialLabelTakenError)
  })

  it("writes NO row when CREDENTIALS_KEY is unset", async () => {
    const user = await makeUser()
    delete process.env.CREDENTIALS_KEY

    await expect(
      createCredential(user.id, { label: "Workday", secret: SECRET })
    ).rejects.toBeInstanceOf(CredentialsKeyUnavailableError)

    expect(await prisma.credential.count({ where: { userId: user.id } })).toBe(0)
  })

  it("writes NO row when CREDENTIALS_KEY is malformed", async () => {
    const user = await makeUser()
    process.env.CREDENTIALS_KEY = randomBytes(31).toString("base64")

    await expect(
      createCredential(user.id, { label: "Workday", secret: SECRET })
    ).rejects.toBeInstanceOf(CredentialsKeyUnavailableError)

    expect(await prisma.credential.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe("the list and detail paths never carry the plaintext", () => {
  it("returns rows without the three secret columns", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    const [row] = await listCredentials(user.id)
    const detail = await getCredential(user.id, created.id)

    for (const shape of [row, detail]) {
      const serialised = JSON.stringify(shape)
      expect(serialised).not.toContain(SECRET)
      expect(Object.keys(shape)).not.toContain("secretCiphertext")
      expect(Object.keys(shape)).not.toContain("secretNonce")
      expect(Object.keys(shape)).not.toContain("secretAuthTag")
    }
  })
})

describe("revealCredential", () => {
  it("returns the secret when the account password is right", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe(SECRET)
  })

  it("throws and returns no secret when the account password is wrong", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    await expect(revealCredential(user.id, created.id, "not my password")).rejects.toBeInstanceOf(
      InvalidAccountPasswordError
    )
  })

  it("does not confirm a credential exists to a user who does not own it", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createCredential(owner.id, { label: "Workday", secret: SECRET })

    await expect(
      revealCredential(other.id, created.id, ACCOUNT_PASSWORD)
    ).rejects.toBeInstanceOf(CredentialNotFoundError)
  })

  it("round-trips a multi-byte secret", async () => {
    const user = await makeUser()
    const secret = "pässwörd·日本語·🔐"
    const created = await createCredential(user.id, { label: "Workday", secret })

    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe(secret)
  })

  it("surfaces an unreadable row as its own error rather than a blank", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    process.env.CREDENTIALS_KEY = base64Key()

    await expect(
      revealCredential(user.id, created.id, ACCOUNT_PASSWORD)
    ).rejects.toBeInstanceOf(CredentialUndecryptableError)
  })

  it("surfaces a tampered ciphertext as a DIFFERENT error than a missing key", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    // The key stays exactly as it was sealed under — only the stored bytes
    // change — so `resolveKeyById` still finds a key and `open` is the thing
    // that fails, which is what makes this the tampering case and not the
    // missing-key one.
    const sealed = await credentialRepository.findSealedById(user.id, created.id)
    const ciphertext = Uint8Array.from(sealed!.secretCiphertext)
    ciphertext[0] ^= 0x01
    await prisma.credential.update({
      where: { id: created.id },
      data: { secretCiphertext: Buffer.from(ciphertext) },
    })

    let caught: unknown
    try {
      await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CredentialTamperedError)
    expect(caught).not.toBeInstanceOf(CredentialUndecryptableError)
  })
})

describe("updateCredential", () => {
  it("leaves the secret byte-identical when only the label changes", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })
    const before = await credentialRepository.findSealedById(user.id, created.id)

    await updateCredential(user.id, created.id, { label: "Workday — Acme" })

    const after = await credentialRepository.findSealedById(user.id, created.id)
    expect(after?.label).toBe("Workday — Acme")
    expect(Buffer.from(after!.secretCiphertext)).toEqual(Buffer.from(before!.secretCiphertext))
    expect(Buffer.from(after!.secretNonce)).toEqual(Buffer.from(before!.secretNonce))
    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe(SECRET)
  })

  it("re-encrypts with a FRESH nonce when a new secret is supplied", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })
    const before = await credentialRepository.findSealedById(user.id, created.id)

    await updateCredential(user.id, created.id, { label: "Workday", secret: "a new password" })

    const after = await credentialRepository.findSealedById(user.id, created.id)
    expect(Buffer.from(after!.secretNonce)).not.toEqual(Buffer.from(before!.secretNonce))
    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe("a new password")
  })

  it("clears siteUrl, username and notes rather than leaving them", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, {
      label: "Workday",
      siteUrl: "https://acme.example",
      username: "me@example.com",
      notes: "A note",
      secret: SECRET,
    })

    await updateCredential(user.id, created.id, { label: "Workday" })

    const after = await getCredential(user.id, created.id)
    expect(after.siteUrl).toBeNull()
    expect(after.username).toBeNull()
    expect(after.notes).toBeNull()
  })

  it("refuses a label another of the user's credentials already holds", async () => {
    const user = await makeUser()
    await createCredential(user.id, { label: "Workday", secret: SECRET })
    const second = await createCredential(user.id, { label: "Greenhouse", secret: SECRET })

    await expect(
      updateCredential(user.id, second.id, { label: "Workday" })
    ).rejects.toBeInstanceOf(CredentialLabelTakenError)
  })
})

describe("rotation", () => {
  it("reads a row under the previous key, re-encrypts it under the current one, and counts down", async () => {
    const user = await makeUser()
    const oldKey = process.env.CREDENTIALS_KEY!
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })
    const before = await credentialRepository.findSealedById(user.id, created.id)

    process.env.CREDENTIALS_KEY = base64Key()
    process.env.CREDENTIALS_KEY_PREVIOUS = oldKey

    expect(await countCredentialsNeedingReencryption(user.id)).toBe(1)
    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe(SECRET)

    expect(await reencryptCredentials(user.id)).toBe(1)
    expect(await countCredentialsNeedingReencryption(user.id)).toBe(0)

    const after = await credentialRepository.findSealedById(user.id, created.id)
    expect(after?.keyId).not.toBe(before?.keyId)
    expect(Buffer.from(after!.secretNonce)).not.toEqual(Buffer.from(before!.secretNonce))

    delete process.env.CREDENTIALS_KEY_PREVIOUS
    expect(await revealCredential(user.id, created.id, ACCOUNT_PASSWORD)).toBe(SECRET)
  })

  it("refuses to re-encrypt a row it cannot read, and leaves it exactly as it was", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })
    const before = await credentialRepository.findSealedById(user.id, created.id)

    process.env.CREDENTIALS_KEY = base64Key()

    await expect(reencryptCredentials(user.id)).rejects.toBeInstanceOf(
      CredentialUndecryptableError
    )

    const after = await credentialRepository.findSealedById(user.id, created.id)
    expect(after?.keyId).toBe(before?.keyId)
    expect(Buffer.from(after!.secretCiphertext)).toEqual(Buffer.from(before!.secretCiphertext))
  })
})

describe("ownership", () => {
  it("does not list, read, update, reveal or delete another user's credential", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await createCredential(owner.id, { label: "Workday", secret: SECRET })

    expect(await listCredentials(other.id)).toHaveLength(0)
    await expect(getCredential(other.id, created.id)).rejects.toBeInstanceOf(
      CredentialNotFoundError
    )
    await expect(
      updateCredential(other.id, created.id, { label: "Hacked", secret: "theirs now" })
    ).rejects.toBeInstanceOf(CredentialNotFoundError)
    await expect(deleteCredential(other.id, created.id)).rejects.toBeInstanceOf(
      CredentialNotFoundError
    )

    expect((await getCredential(owner.id, created.id)).label).toBe("Workday")
    expect(await revealCredential(owner.id, created.id, ACCOUNT_PASSWORD)).toBe(SECRET)
  })

  it("deletes a row the key can no longer read", async () => {
    const user = await makeUser()
    const created = await createCredential(user.id, { label: "Workday", secret: SECRET })

    process.env.CREDENTIALS_KEY = base64Key()
    await deleteCredential(user.id, created.id)

    expect(await prisma.credential.count({ where: { userId: user.id } })).toBe(0)
  })
})

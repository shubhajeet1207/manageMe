import { verifyPassword } from "@/lib/auth/password"
import {
  getCredentialsKey,
  getPreviousCredentialsKey,
  isCredentialsKeyConfigured,
  resolveKeyById,
} from "@/server/crypto/credentials-key"
import { open, seal } from "@/server/crypto/secret-box"
import * as credentialRepository from "@/server/repositories/credential-repository"
import type { CredentialSummary, SealedColumns } from "@/server/repositories/credential-repository"
import * as userRepository from "@/server/repositories/user-repository"
import type {
  CreateCredentialInput,
  UpdateCredentialInput,
} from "@/server/validators/credential-schemas"
import type { Credential } from "@prisma/client"

/**
 * The only module in the app that calls `seal` or `open`. Plaintext lives here
 * for the duration of one call and is handed to the repository as three opaque
 * byte arrays, so there is no service function anywhere that returns a
 * credential row WITH a plaintext field — the reveal path returns a bare
 * string and nothing else.
 *
 * No error thrown here interpolates any input, and nothing here logs a
 * ciphertext, a nonce, a key or a plaintext (§9.8).
 */

export { CredentialsKeyUnavailableError } from "@/server/crypto/credentials-key"

export class CredentialLabelTakenError extends Error {
  constructor() {
    super("You already have a credential with this label")
  }
}

export class CredentialNotFoundError extends Error {
  constructor() {
    super("Credential not found")
  }
}

/** A row sealed under a key this process doesn't have configured. Never
 *  silently deleted, never overwritten, and never shown as blank — a blank
 *  field reads as "there is no password here", which is the wrong thing to
 *  believe (§9.5). Restoring the key genuinely fixes this case, which is why
 *  it gets its own error rather than sharing one with `CredentialTamperedError`
 *  below: that advice is actively wrong for a row whose ciphertext failed
 *  authentication under a key that WAS found. */
export class CredentialUndecryptableError extends Error {
  constructor() {
    super(
      "This password was encrypted with a key that isn't configured here. Restore the CREDENTIALS_KEY (or CREDENTIALS_KEY_PREVIOUS) it was sealed under, or delete this record."
    )
    this.name = "CredentialUndecryptableError"
  }
}

/** A row whose key WAS resolved, but whose ciphertext or auth tag failed
 *  AES-256-GCM authentication — corruption or tampering, not a missing key.
 *  "Restore the key" is not just unhelpful advice here, it's wrong: the key on
 *  file is already the right one, and re-supplying it changes nothing. */
export class CredentialTamperedError extends Error {
  constructor() {
    super(
      "This password's stored data failed an integrity check and can't be read. It cannot be recovered by restoring a key — delete this record."
    )
    this.name = "CredentialTamperedError"
  }
}

/** Carries no information about the credential, on purpose. */
export class InvalidAccountPasswordError extends Error {
  constructor() {
    super("That password isn't right.")
    this.name = "InvalidAccountPasswordError"
  }
}

export type VaultStatus = {
  keyConfigured: boolean
  needingReencryption: number
  unreadable: number
}

function sealFor(userId: string, secret: string): SealedColumns {
  // Throws before any row is written, so a missing or malformed key cannot end
  // in a half-written record — and the three secret columns are non-nullable,
  // so "store the plaintext instead" is not a state the schema can reach.
  const { key, keyId } = getCredentialsKey()
  const sealed = seal(secret, userId, key)
  return { ...sealed, keyId }
}

function openSealed(userId: string, row: Credential): string {
  const key = resolveKeyById(row.keyId)
  if (!key) throw new CredentialUndecryptableError()

  try {
    return open(
      { ciphertext: row.secretCiphertext, nonce: row.secretNonce, authTag: row.secretAuthTag },
      userId,
      key
    )
  } catch {
    // The row id at most. Never the ciphertext, never the nonce, never the key,
    // and never the plaintext.
    console.error("Failed to decrypt credential", row.id)
    throw new CredentialTamperedError()
  }
}

export function listCredentials(userId: string): Promise<CredentialSummary[]> {
  return credentialRepository.listByUser(userId)
}

export async function getCredential(userId: string, id: string): Promise<CredentialSummary> {
  const credential = await credentialRepository.findById(userId, id)
  if (!credential) throw new CredentialNotFoundError()
  return credential
}

export async function createCredential(
  userId: string,
  input: CreateCredentialInput
): Promise<CredentialSummary> {
  const existing = await credentialRepository.findByLabel(userId, input.label)
  if (existing) throw new CredentialLabelTakenError()

  const { secret, ...fields } = input
  return credentialRepository.create(userId, fields, sealFor(userId, secret))
}

/**
 * An absent secret means "leave the stored password alone" — the one place in
 * this phase where `undefined` meaning "don't change" is correct. A supplied
 * one is re-sealed with a FRESH nonce; there is no path that reads a stored
 * nonce back into an encryption.
 */
export async function updateCredential(
  userId: string,
  id: string,
  input: Omit<UpdateCredentialInput, "id">
): Promise<CredentialSummary> {
  const clash = await credentialRepository.findByLabel(userId, input.label)
  if (clash && clash.id !== id) throw new CredentialLabelTakenError()

  const { secret, ...fields } = input
  const sealed = secret === undefined ? undefined : sealFor(userId, secret)

  const updated = await credentialRepository.update(userId, id, fields, sealed)
  if (!updated) throw new CredentialNotFoundError()
  return updated
}

export async function deleteCredential(userId: string, id: string): Promise<void> {
  const deleted = await credentialRepository.remove(userId, id)
  if (!deleted) throw new CredentialNotFoundError()
}

/**
 * The only caller of `secretBox.open` on a request path, and the only function
 * in the app that returns a stored password. It requires the ACCOUNT password,
 * so a session alone is not sufficient to exfiltrate the vault (§9.7), and it
 * writes nothing: a read path that writes can fail for a write reason.
 */
export async function revealCredential(
  userId: string,
  id: string,
  accountPassword: string
): Promise<string> {
  const user = await userRepository.findById(userId)
  if (!user) throw new InvalidAccountPasswordError()

  // Checked before the row is fetched, so a wrong password learns nothing about
  // whether the id exists.
  const ok = await verifyPassword(accountPassword, user.hashedPassword)
  if (!ok) throw new InvalidAccountPasswordError()

  const row = await credentialRepository.findSealedById(userId, id)
  if (!row) throw new CredentialNotFoundError()

  return openSealed(userId, row)
}

/**
 * Which key ids this process can open, so the list can mark an unreadable row
 * instead of showing it as blank. It returns key IDS — the first 8 bytes of
 * SHA-256 over the key — and never key material.
 */
export function listReadableKeyIds(): string[] {
  if (!isCredentialsKeyConfigured()) return []

  const ids = [getCredentialsKey().keyId]
  const previous = getPreviousCredentialsKey()
  if (previous) ids.push(previous.keyId)
  return ids
}

export function countCredentialsNeedingReencryption(userId: string): Promise<number> {
  const { keyId } = getCredentialsKey()
  return credentialRepository.countWithOtherKeyId(userId, keyId)
}

/**
 * What `/credentials` needs to render its banners without ever touching a
 * ciphertext: whether the key is configured at all, how many rows are still on
 * the previous key, and how many no key available can read.
 */
export async function getVaultStatus(userId: string): Promise<VaultStatus> {
  if (!isCredentialsKeyConfigured()) {
    return { keyConfigured: false, needingReencryption: 0, unreadable: 0 }
  }

  const { keyId } = getCredentialsKey()
  const rows = await credentialRepository.listByUser(userId)

  let needingReencryption = 0
  let unreadable = 0
  for (const row of rows) {
    if (row.keyId === keyId) continue
    needingReencryption += 1
    if (!resolveKeyById(row.keyId)) unreadable += 1
  }

  return { keyConfigured: true, needingReencryption, unreadable }
}

/**
 * The only re-encryption path. Lazy re-encryption on reveal was rejected: a
 * read path that writes can fail for a write reason, which turns "show me my
 * password" into an operation a database constraint can break.
 *
 * A row it cannot read stops the walk rather than being skipped, overwritten or
 * deleted, and every re-seal uses a fresh nonce even though the key is new.
 */
export async function reencryptCredentials(userId: string): Promise<number> {
  const { key, keyId } = getCredentialsKey()
  const rows = await credentialRepository.listSealedByUser(userId)

  let count = 0
  for (const row of rows) {
    if (row.keyId === keyId) continue

    const plaintext = openSealed(userId, row)
    const resealed = seal(plaintext, userId, key)
    const replaced = await credentialRepository.replaceSealed(userId, row.id, {
      ...resealed,
      keyId,
    })
    if (replaced) count += 1
  }

  return count
}

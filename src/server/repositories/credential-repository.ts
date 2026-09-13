import { prisma } from "@/lib/db/prisma"
import type { Credential } from "@prisma/client"
import type { CreateCredentialInput } from "@/server/validators/credential-schemas"

/**
 * Prisma queries and nothing else. This file knows nothing about plaintext,
 * keys or algorithms: the service seals and hands three opaque byte arrays
 * down, which is what stops a list query from ever being able to decrypt
 * something by accident.
 *
 * `src/lib/db/prisma.ts` omits the three secret columns from every query in the
 * app. `findSealedById` and `listSealedByUser` are the only two functions in
 * the codebase that opt back in.
 */

export type SealedColumns = {
  ciphertext: Uint8Array<ArrayBuffer>
  nonce: Uint8Array<ArrayBuffer>
  authTag: Uint8Array<ArrayBuffer>
  keyId: string
}

export type CredentialFields = Omit<CreateCredentialInput, "secret">

/** What every read path but the reveal one returns: the row minus its secret. */
export type CredentialSummary = Omit<
  Credential,
  "secretCiphertext" | "secretNonce" | "secretAuthTag"
>

const SEAL_INCLUDE = {
  omit: { secretCiphertext: false, secretNonce: false, secretAuthTag: false },
} as const

export function listByUser(userId: string): Promise<CredentialSummary[]> {
  return prisma.credential.findMany({ where: { userId }, orderBy: { label: "asc" } })
}

export function findById(userId: string, id: string): Promise<CredentialSummary | null> {
  return prisma.credential.findFirst({ where: { id, userId } })
}

export function findByLabel(userId: string, label: string): Promise<CredentialSummary | null> {
  return prisma.credential.findFirst({ where: { userId, label } })
}

/**
 * The only read that re-includes the ciphertext, and it is called from exactly
 * one place: the reveal path in credential-service.ts. Scoped by
 * `{ id, userId }` like every other read, so another user's row is `null` here
 * rather than a row that then fails to open.
 */
export function findSealedById(userId: string, id: string): Promise<Credential | null> {
  return prisma.credential.findFirst({ where: { id, userId }, ...SEAL_INCLUDE })
}

/** The re-encryption walk (§9.5). The other opt-in, and the only other one. */
export function listSealedByUser(userId: string): Promise<Credential[]> {
  return prisma.credential.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    ...SEAL_INCLUDE,
  })
}

export function countWithOtherKeyId(userId: string, keyId: string): Promise<number> {
  return prisma.credential.count({ where: { userId, keyId: { not: keyId } } })
}

export function create(
  userId: string,
  data: CredentialFields,
  sealed: SealedColumns
): Promise<CredentialSummary> {
  return prisma.credential.create({
    data: {
      userId,
      label: data.label,
      siteUrl: data.siteUrl ?? null,
      username: data.username ?? null,
      notes: data.notes ?? null,
      secretCiphertext: sealed.ciphertext,
      secretNonce: sealed.nonce,
      secretAuthTag: sealed.authTag,
      keyId: sealed.keyId,
    },
  })
}

/**
 * The secret is a SEPARATE optional argument rather than part of `data`, so the
 * three columns are written only when one is supplied. An absent secret means
 * "leave the stored password alone" — the one place in this phase where
 * `undefined` meaning "don't change" is correct rather than the §6.3 bug, and
 * the reason the plain fields below still go through `?? null`.
 */
export async function update(
  userId: string,
  id: string,
  data: CredentialFields,
  sealed?: SealedColumns
): Promise<CredentialSummary | null> {
  const { count } = await prisma.credential.updateMany({
    where: { id, userId },
    data: {
      label: data.label,
      siteUrl: data.siteUrl ?? null,
      username: data.username ?? null,
      notes: data.notes ?? null,
      ...(sealed
        ? {
            secretCiphertext: sealed.ciphertext,
            secretNonce: sealed.nonce,
            secretAuthTag: sealed.authTag,
            keyId: sealed.keyId,
            secretUpdatedAt: new Date(),
          }
        : {}),
    },
  })
  if (count === 0) return null
  return prisma.credential.findFirst({ where: { id, userId } })
}

/**
 * Rotation only. `secretUpdatedAt` deliberately does not move: re-encrypting a
 * row changes which key holds the password, not the password, and a vault that
 * reported every login as "changed today" after a rotation would be lying.
 */
export async function replaceSealed(
  userId: string,
  id: string,
  sealed: SealedColumns
): Promise<boolean> {
  const { count } = await prisma.credential.updateMany({
    where: { id, userId },
    data: {
      secretCiphertext: sealed.ciphertext,
      secretNonce: sealed.nonce,
      secretAuthTag: sealed.authTag,
      keyId: sealed.keyId,
    },
  })
  return count > 0
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.credential.deleteMany({ where: { id, userId } })
  return count > 0
}

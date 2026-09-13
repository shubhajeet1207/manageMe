import { z } from "zod"
import { optionalShortText } from "@/server/validators/limits"
import { optionalHttpUrl } from "@/server/validators/url"

// `.optional()` MUST be the outermost wrapper on every optional field — see the
// note in company-schemas.ts.

/** An unbounded secret column is a blob column with a misleading name. */
export const MAX_SECRET_LENGTH = 512

const credentialFields = {
  label: z.string().trim().min(1, "Label is required").max(200),
  siteUrl: optionalHttpUrl(),
  // Plaintext by design: the list identifies a record by it, and encrypting it
  // would force a decrypt on every list render — the one thing §9.6 forbids.
  username: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  notes: optionalShortText,
}

// Never trimmed, anywhere. Leading and trailing whitespace can be part of a
// password, and silently trimming it makes a correct password fail.
const secret = z
  .string({ error: "Password is required" })
  .min(1, "Password is required")
  .max(MAX_SECRET_LENGTH, `Passwords must be ${MAX_SECRET_LENGTH} characters or less`)

export const createCredentialSchema = z.object({ ...credentialFields, secret })
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>

/**
 * On update an absent or empty secret means "leave the stored password alone".
 * This is the one place in the phase where `undefined` meaning "don't change"
 * is correct rather than the §6.3 bug: editing a label must not require
 * re-typing the password, and there is no way to clear a secret to empty —
 * a credential without a password is deleted, not blanked.
 */
export const updateCredentialSchema = z.object({
  id: z.string().min(1),
  ...credentialFields,
  secret: z
    .string()
    .max(MAX_SECRET_LENGTH, `Passwords must be ${MAX_SECRET_LENGTH} characters or less`)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
})
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>

/** The step-up. `password` is the ACCOUNT password, verified with the same
 *  argon2id `verifyPassword` the login form uses, and never trimmed. */
export const revealCredentialSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1, "Enter your account password"),
})
export type RevealCredentialInput = z.infer<typeof revealCredentialSchema>

export const credentialIdSchema = z.object({ id: z.string().min(1) })
export type CredentialIdInput = z.infer<typeof credentialIdSchema>

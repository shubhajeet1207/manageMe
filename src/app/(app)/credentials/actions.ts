"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { CredentialsKeyUnavailableError } from "@/server/crypto/credentials-key"
import {
  CredentialLabelTakenError,
  CredentialNotFoundError,
  CredentialUndecryptableError,
  InvalidAccountPasswordError,
  createCredential,
  deleteCredential,
  reencryptCredentials,
  revealCredential,
  updateCredential,
} from "@/server/services/credential-service"
import {
  createCredentialSchema,
  credentialIdSchema,
  revealCredentialSchema,
  updateCredentialSchema,
} from "@/server/validators/credential-schemas"
import type { ActionResult } from "@/types/action-result"

const KEY_MISSING = "Credential storage isn't configured. Set CREDENTIALS_KEY."
const GENERIC = "Something went wrong. Please try again."

/**
 * Reveal gets its OWN result type, declared here rather than by widening the
 * shared `ActionResult` to carry a data payload: making every action in the app
 * able to return data so that one action can is exactly backwards.
 */
export type RevealResult =
  | { success: true; secret: string }
  | { success: false; fieldErrors?: Record<string, string[]>; formError?: string }

export async function createCredentialAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createCredentialSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createCredential(session.user.id, parsed.data)
    revalidatePath("/credentials")
    return { success: true }
  } catch (error) {
    if (error instanceof CredentialLabelTakenError) {
      return { success: false, fieldErrors: { label: [error.message] } }
    }
    // The seal happens before any row is written, so this reached here with
    // nothing persisted.
    if (error instanceof CredentialsKeyUnavailableError) {
      return { success: false, formError: KEY_MISSING }
    }
    return { success: false, formError: GENERIC }
  }
}

export async function updateCredentialAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateCredentialSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateCredential(session.user.id, id, data)
    revalidatePath("/credentials")
    return { success: true }
  } catch (error) {
    if (error instanceof CredentialLabelTakenError) {
      return { success: false, fieldErrors: { label: [error.message] } }
    }
    if (error instanceof CredentialNotFoundError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CredentialsKeyUnavailableError) {
      return { success: false, formError: KEY_MISSING }
    }
    return { success: false, formError: GENERIC }
  }
}

export async function deleteCredentialAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = credentialIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, formError: GENERIC }

  try {
    // Works with no key at all: deleting a row you can no longer read is a
    // reasonable thing to want.
    await deleteCredential(session.user.id, parsed.data.id)
    revalidatePath("/credentials")
    return { success: true }
  } catch (error) {
    if (error instanceof CredentialNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: GENERIC }
  }
}

/**
 * POST-only, and the only path in the app that returns a stored password.
 * There is no route handler, no GET, and no URL that carries a secret.
 *
 * It calls `auth()` itself like every other action — route protection guards
 * navigation, actions guard data — and it takes the user id from the session,
 * never from the payload. It additionally requires the ACCOUNT password, so a
 * session on its own is not enough to exfiltrate the vault (§9.7).
 */
export async function revealCredentialAction(input: unknown): Promise<RevealResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = revealCredentialSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: { password: ["Enter your account password"] } }
  }

  try {
    // Nothing is revalidated and nothing is written: a read path that writes
    // can fail for a write reason, and a refresh would re-render the tree while
    // a secret is in it.
    const secret = await revealCredential(
      session.user.id,
      parsed.data.id,
      parsed.data.password
    )
    return { success: true, secret }
  } catch (error) {
    if (error instanceof InvalidAccountPasswordError) {
      // A field error on the password, and no information about the credential.
      return { success: false, fieldErrors: { password: [error.message] } }
    }
    if (error instanceof CredentialNotFoundError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CredentialUndecryptableError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CredentialsKeyUnavailableError) {
      return { success: false, formError: KEY_MISSING }
    }
    return { success: false, formError: GENERIC }
  }
}

export async function reencryptCredentialsAction(): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  try {
    await reencryptCredentials(session.user.id)
    revalidatePath("/credentials")
    return { success: true }
  } catch (error) {
    if (error instanceof CredentialUndecryptableError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CredentialsKeyUnavailableError) {
      return { success: false, formError: KEY_MISSING }
    }
    return { success: false, formError: GENERIC }
  }
}

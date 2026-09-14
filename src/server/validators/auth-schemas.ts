import { z } from "zod"

/**
 * NIST SP 800-63B §5.1.1.2: length is the control that actually buys entropy,
 * and forced character classes are explicitly discouraged because they push
 * people to "Password1!" and nowhere else. The old rule here — 8 characters,
 * one letter, one digit — accepted "password1", which is on every guessing list
 * ever published, so it was enforcing effort without enforcing strength.
 *
 * 12 rather than a bigger round number: an all-lowercase 12-character string is
 * already ~56 bits, which against argon2id's per-guess cost is not a number
 * anyone works through offline, and 12 is short enough that the one real user
 * still types it on a phone rather than reaching for a sticky note.
 */
const MIN_PASSWORD_LENGTH = 12

/**
 * NIST requires verifiers to accept at least 64 characters, so this is well
 * clear of any real passphrase. It exists because the value goes straight into
 * argon2id: unbounded, a client can post a multi-megabyte "password" and make
 * the server hash it, which is the same CPU-exhaustion problem the limiter in
 * src/lib/rate-limit.ts exists to stop — just reached through a different door.
 */
const MAX_PASSWORD_LENGTH = 128

/**
 * "aaaaaaaaaaaa" clears a 12-character minimum with about five bits of entropy
 * behind it. This is not a composition rule sneaking back in — NIST asks
 * verifiers to reject repetitive strings precisely so that dropping the
 * character classes does not leave length as the only thing checked. No
 * passphrase a person actually chooses can trip it.
 */
const SINGLE_REPEATED_CHARACTER = /^(.)\1*$/

/**
 * The policy for passwords being SET — signup and change-password.
 *
 * Deliberately NOT applied to the password being VERIFIED at login. The existing
 * account's password was chosen under the old 8-character rule; running this
 * over the login form would lock its owner out of their own app over a rule that
 * only governs what they may choose next. See loginSchema below.
 */
const newPasswordRules = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  // No .trim() on purpose: a leading or trailing space is a legitimate part of a
  // passphrase, and trimming it here would store a different string than the one
  // the user typed — and than the one login will send back, since login does not
  // trim either.
  .refine(
    (value) => !SINGLE_REPEATED_CHARACTER.test(value),
    "Password must not be a single character repeated"
  )

/**
 * An upper bound for passwords being VERIFIED, deliberately eight times
 * MAX_PASSWORD_LENGTH so it can never reject a password this app would have let
 * anyone set — it is a denial-of-service bound, not a policy.
 *
 * It is here because next.config.ts raises serverActions.bodySizeLimit to 12mb
 * for resume uploads, and that limit is global: without a cap, a login post can
 * hand argon2id a twelve-megabyte "password" and make the server absorb it. The
 * limiter in src/lib/rate-limit.ts caps how OFTEN that can happen; this caps how
 * much each one costs.
 */
const MAX_VERIFIED_PASSWORD_LENGTH = MAX_PASSWORD_LENGTH * 8

/**
 * The verify side: whatever the user typed must reach argon2 unchanged, so there
 * is no policy here beyond "non-empty" and the DoS bound above. A password
 * chosen under the old 8-character rule has to keep working — the new policy
 * governs what may be chosen next, not what already exists.
 */
function verifiedPassword(requiredMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    // Its own message rather than reusing requiredMessage: these schemas also
    // run client-side through zodResolver, and "Password is required" under a
    // field the user has clearly filled in is a bug report waiting to happen.
    .max(MAX_VERIFIED_PASSWORD_LENGTH, "Password is too long")
}

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: newPasswordRules,
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  // NOT newPasswordRules, and it must stay that way: tightening this would not
  // reject an attacker, it would reject the owner whose password predates the
  // current policy — and it would turn the login form into a free oracle for the
  // policy's exact shape.
  password: verifiedPassword("Password is required"),
})
export type LoginInput = z.infer<typeof loginSchema>

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const changePasswordSchema = z.object({
  // Same reasoning as loginSchema.password: this one is verified, not chosen.
  currentPassword: verifiedPassword("Current password is required"),
  newPassword: newPasswordRules,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

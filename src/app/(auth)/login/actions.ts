"use server"

import { headers } from "next/headers"
import { AuthError } from "next-auth"
import { loginSchema } from "@/server/validators/auth-schemas"
import { signIn } from "@/lib/auth/auth"
import {
  clientIpFromHeaders,
  consumeAll,
  emailKey,
  ipKey,
  loginRateLimiter,
  resetAll,
  retryAfterMessage,
} from "@/lib/rate-limit"

export type LoginResult = { success: true } | { success: false; formError: string }

export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    // Not rate limited: this branch never reaches argon2 or the database, so it
    // is not the expensive path the limiter exists to protect, and charging it
    // would let a flood of malformed posts spend the real user's budget.
    return { success: false, formError: "Enter a valid email and password." }
  }

  // Both keys, and both before signIn. Every login attempt costs a full argon2id
  // verification (19 MiB and a deliberate CPU burn), so this must run BEFORE the
  // work, not as a check on the result — otherwise the flood has already been
  // paid for by the time we decide to reject it.
  //
  // The email key is what still bites when the deployment has no proxy
  // overwriting X-Forwarded-For and the IP key can be rotated at will; the IP
  // key is what still bites when the attacker rotates the email. Neither alone
  // covers the other.
  const keys = [
    ipKey(clientIpFromHeaders(await headers())),
    // Buckets are created lazily and identically for addresses that exist and
    // addresses that do not, so keying on email adds no account-existence signal
    // that login does not already withhold.
    emailKey(parsed.data.email),
  ]

  const decision = await consumeAll(loginRateLimiter, keys)
  if (!decision.allowed) {
    return {
      success: false,
      formError: `Too many login attempts. Try again in ${retryAfterMessage(
        decision.retryAfterMs
      )}.`,
    }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, formError: "Invalid email or password." }
    }
    throw error
  }

  // Proving you hold the password refunds the budget, so the owner who fumbled
  // it six times and then got it right walks away with a full bucket instead of
  // a nearly empty one that the next typo would tip over.
  //
  // The trade-off is that this also clears the IP bucket, so an attacker sharing
  // a NAT with the owner gets a fresh burst each time the owner logs in. That
  // costs the attacker ten more guesses against a limiter they were already
  // going to outlast; a lockout costs the only real user their own app.
  await resetAll(loginRateLimiter, keys)
  return { success: true }
}

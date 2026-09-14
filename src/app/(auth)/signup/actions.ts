"use server"

import { headers } from "next/headers"
import type { ActionResult } from "@/types/action-result"
import { signupSchema } from "@/server/validators/auth-schemas"
import { EmailAlreadyExistsError, createUser } from "@/server/services/auth-service"
import { signIn } from "@/lib/auth/auth"
import {
  clientIpFromHeaders,
  consumeAll,
  emailKey,
  ipKey,
  retryAfterMessage,
  signupRateLimiter,
} from "@/lib/rate-limit"

export async function signupAction(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    // Not rate limited, same as login: a schema rejection touches neither the
    // database nor argon2, so charging it would only give a flood of malformed
    // posts a way to spend the real user's budget.
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  // Before the existence check, not after — so a probe costs an attempt whether
  // or not the address is registered. Metering only the "already exists" branch
  // would leave the oracle free to walk for every address that is not the
  // owner's, which is the entire list an attacker is testing.
  const keys = [
    ipKey(clientIpFromHeaders(await headers())),
    emailKey(parsed.data.email),
  ]

  const decision = await consumeAll(signupRateLimiter, keys)
  if (!decision.allowed) {
    return {
      success: false,
      formError: `Too many signup attempts. Try again in ${retryAfterMessage(
        decision.retryAfterMs
      )}.`,
    }
  }

  try {
    await createUser(parsed.data)
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      // DECISION: keep the honest message; let the rate limit price the oracle.
      //
      // Yes, this discloses that an address is registered, and login is uniform
      // precisely so it does not. Three reasons it stays anyway:
      //
      // 1. A uniform response needs somewhere else to put the truth. The real
      //    pattern is "check your email", where the mail either welcomes you or
      //    says you already have an account. This app sends no mail and has no
      //    mail dependency, so "uniform" here collapses into either reporting
      //    success and creating nothing — stranding the user with an account
      //    that does not exist — or a generic failure that sends them into a
      //    retry loop and straight into the limiter above.
      //
      // 2. Uniform text alone would be theatre. createUser returns here BEFORE
      //    it reaches argon2, so this branch is measurably faster than a real
      //    signup no matter what string it returns. Closing the oracle properly
      //    means equalising the work too, and until that is done the message is
      //    not the channel that matters — the rate limit is what actually
      //    prices probing, at five attempts then one per five minutes per IP and
      //    per address.
      //
      // 3. What leaks is whether one address belongs to the single owner — an
      //    address already printed on the resumes this app stores and sent with
      //    the applications it tracks. It is not a secret the app is keeping.
      //
      // The real fix, if the oracle ever needs to be gone rather than priced:
      // refuse signup outright once an account exists. A single-user tracker has
      // no second signup, so "signups are closed" is the same answer for every
      // address and there is nothing left to probe. That needs a product
      // decision and a change in auth-service, so it is not made here.
      //
      // THE TRADE-OFF, stated plainly: this is still a real disclosure, and the
      // argument above is load-bearing on "single user, no mail". It flips the
      // moment signup is open to strangers or an email channel exists — at which
      // point the answer is the uniform "check your email" flow, not a vaguer
      // string here. The cost of the other choice is the common case: the person
      // seeing this is almost always the owner who forgot they already signed
      // up, and telling them so is the one useful thing this branch can do.
      return { success: false, fieldErrors: { email: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  // No limiter reset on success, unlike login — and this is a security line, not
  // an oversight. A signup SUCCEEDS exactly when the address was not registered,
  // which is the same bit a probe is trying to learn. Refunding here would let an
  // enumerator buy a fresh burst every few addresses by registering junk
  // accounts, and the limit above would stop metering the walk it exists to stop.
  // Nothing is lost: signup is once per lifetime here, so no legitimate user is
  // ever waiting on this bucket.
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  })

  return { success: true }
}

import { createHash } from "node:crypto"
import type { NextAuthConfig } from "next-auth"
import { prisma } from "@/lib/db/prisma"
import { validateEnv } from "@/lib/env"

/**
 * Boot-time environment validation, run here because this module is on the
 * import path of BOTH entry points the server has: `src/proxy.ts` (every
 * matched request) and `src/lib/auth/auth.ts` (every Server Action and every
 * authenticated page). A missing AUTH_SECRET therefore fails the process
 * instead of failing the first person who types a password.
 *
 * `src/instrumentation.ts`'s `register()` hook is the canonical home for this in
 * Next 16 and should take it over when that file exists; until then this is the
 * earliest module in the app that is guaranteed to load.
 */
validateEnv()

/**
 * The origin next-auth will rewrite every request onto, if one is configured.
 * `next-auth/lib/env.js` reads exactly these two names (`reqWithEnvURL`), so no
 * other variable — NEXT_PUBLIC_APP_URL included — can stand in for them: setting
 * a value the library does not read would mean trusting the Host header while
 * believing we had stopped.
 */
const canonicalAuthUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL

/**
 * The token claim holding the password fingerprint. Short because it is carried
 * in the session cookie on every request and the cookie has a 4KB budget.
 */
const PASSWORD_FINGERPRINT_CLAIM = "pwf"

/**
 * A value that changes when, and only when, the password changes.
 *
 * The schema has no `passwordChangedAt` column, so the hash itself is the only
 * thing available that moves on a password change and nothing else — `updatedAt`
 * moves when the user renames themselves, which would log everyone out for
 * editing their profile.
 *
 * What is stored in the token is a truncated digest, never the hash: 128 bits of
 * SHA-256 is far more than enough for equality, and it means a token that somehow
 * escaped its JWE envelope still carries no argon2 material to attack offline.
 */
function passwordFingerprint(hashedPassword: string): string {
  return createHash("sha256").update(hashedPassword).digest("base64url").slice(0, 22)
}

export const authConfig = {
  /**
   * Trust the `Host`/`X-Forwarded-Host` header only when something else pins the
   * origin down. Unconditional `true` is correct on a laptop and wrong behind a
   * proxy that forwards whatever a client sent: next-auth builds callback and
   * redirect URLs from that header, so a forged one aims them at the attacker's
   * domain.
   *
   * In production the pin is AUTH_URL / NEXTAUTH_URL — with it set,
   * `reqWithEnvURL` rewrites every request onto that origin and the header stops
   * mattering. Without it, this is `false` and next-auth raises `UntrustedHost`,
   * which is a loud, immediate deploy failure rather than a silent open redirect.
   *
   * Note this must be COMPUTED rather than left undefined: next-auth's own
   * default is `config.trustHost ??= ...`, so an explicit `false` can never be
   * lifted by setting AUTH_URL later. This reproduces that default minus the
   * VERCEL/CF_PAGES platform detection, which does not apply here.
   */
  trustHost: process.env.NODE_ENV !== "production" || Boolean(canonicalAuthUrl),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    /**
     * Runs on EVERY request that reads a session, so it does exactly one query
     * and selects exactly one column.
     *
     * Copying `user.id` on first sign-in and never looking again left the JWT as
     * the sole authority on two things the database owns, for the token's whole
     * lifetime:
     *
     *  - a DELETED user kept a fully working session;
     *  - a password change did not end sessions anywhere else, so "someone has
     *    my password, change it" did not actually evict them.
     *
     * Returning `null` invalidates the token — `@auth/core`'s session action
     * clears the session cookie on a null return rather than re-signing it.
     */
    jwt: async ({ token, user }) => {
      // `user` is present only on sign-in, when the token has no `sub` yet.
      const userId = user?.id ?? token.sub
      if (!userId) return null

      // findUnique, not findFirst: the ownership rule's findFirst is about
      // scoping ROWS THAT BELONG TO a user, where "missing" and "not yours" must
      // stay indistinguishable. Here the row IS the user and the id came from a
      // token we signed, so there is no second party to confuse it with.
      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { hashedPassword: true },
      })
      if (!account) return null

      const fingerprint = passwordFingerprint(account.hashedPassword)

      // On sign-in there is nothing to compare against yet; on every later
      // request the stamp must still match the password in the database.
      //
      // A token issued before this callback existed carries no stamp at all, and
      // takes the same path as a stale one: it is invalidated and the user signs
      // in again once. That is deliberate — treating "no stamp" as "fine" would
      // make forging one unnecessary.
      if (!user && token[PASSWORD_FINGERPRINT_CLAIM] !== fingerprint) return null

      token.sub = userId
      token[PASSWORD_FINGERPRINT_CLAIM] = fingerprint
      return token
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
} satisfies NextAuthConfig

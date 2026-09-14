/**
 * Next's startup hook: `register()` runs once when a server instance boots,
 * and — the property that matters — NOT during `next build`.
 *
 * Validation used to run at module scope in `auth.config.ts`, which meant it
 * also ran while `next build` collected page data for /api/auth/[...nextauth],
 * failing the build on any machine without the runtime secrets. On Vercel a
 * variable marked Secret is absent at build time by design, so that was a check
 * running at the wrong moment rather than a misconfiguration to correct.
 */
export async function register() {
  // Node runtime only: the Edge runtime has neither the full process.env nor
  // any use for a connection string, and validating there would fail a good
  // deploy.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { validateEnv } = await import("@/lib/env")

  try {
    validateEnv()
  } catch (error) {
    // In development, stop. The person who can fix it is watching the terminal,
    // and a loud failure now is cheaper than a confusing one later.
    if (process.env.NODE_ENV !== "production") throw error

    /**
     * In production, log and continue — deliberately, and against the original
     * intent, because that intent was measured against the wrong failure.
     *
     * Throwing here does not fail "the process": it fails EVERY request, with
     * an opaque 500 and no body, including /api/health — the one endpoint whose
     * job is to say what is wrong. A single mistyped variable took the entire
     * app down and left nothing to diagnose it with.
     *
     * Continuing is strictly more diagnosable. Each missing variable then fails
     * at the point it is actually needed, where the error names the operation:
     * next-auth reports a missing secret, Prisma reports a missing URL, the
     * storage driver names the provider variable. The app degrades to exactly
     * the features whose configuration is broken, instead of to nothing.
     */
    console.error(
      "[env] Environment validation failed. The app is starting anyway so that " +
        "/api/health and the rest of the app remain reachable, but anything " +
        "depending on these will fail:\n" +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

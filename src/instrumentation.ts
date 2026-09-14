/**
 * Next's startup hook: `register()` runs once when a server instance boots,
 * and — the property that matters here — NOT during `next build`.
 *
 * Environment validation lived at module scope in `auth.config.ts`, which is on
 * the import path of both entry points and so ran whenever that module was
 * evaluated. Building evaluates it too: `next build` collects page data for
 * `/api/auth/[...nextauth]`, which imports auth.config, which threw
 * `EnvValidationError` and failed the build on a machine that legitimately has
 * no DATABASE_URL. On Vercel a variable marked "Sensitive" is absent at build
 * time by design, so this was not a misconfiguration to correct — it was a
 * check running at the wrong moment.
 *
 * Here it runs when a server starts and not when one is built, which is what
 * "boot-time validation" meant all along.
 */
export async function register() {
  // Only the Node runtime: the Edge runtime has neither the full `process.env`
  // nor any use for a Prisma connection string, and validating there would fail
  // a perfectly good deploy.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { validateEnv } = await import("@/lib/env")
  validateEnv()
}

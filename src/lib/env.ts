/**
 * Boot-time environment validation.
 *
 * Before this module, `src/lib/db/prisma.ts` was the only guard in the app, and
 * it only covered DATABASE_URL. Everything else failed at FIRST USE instead: a
 * deploy without AUTH_SECRET booted, served the marketing page, served the login
 * form, and only fell over when somebody typed a password into it — which is the
 * worst possible moment to discover a configuration mistake, because by then the
 * container is "healthy", the rollout is complete, and the failure looks like an
 * auth bug rather than a missing variable.
 *
 * The approach is `getStorage()`'s (src/server/storage/index.ts), generalised: a
 * value that cannot be honoured throws rather than silently degrading. Two rules
 * follow from doing it for secrets rather than for one driver name:
 *
 *  - EVERY problem is collected before throwing. A deploy missing three
 *    variables should need one restart to learn that, not three.
 *  - NO message ever contains a value. These variables are a database password,
 *    a session-signing secret and an AES-256 key; an error that echoed them is
 *    how key material reaches a log aggregator (the same rule
 *    src/server/crypto/credentials-key.ts holds itself to).
 */

/** AES-256. Matches KEY_BYTES in src/server/crypto/credentials-key.ts. */
const CREDENTIALS_KEY_BYTES = 32

/**
 * `openssl rand -base64 32` — what .env.example tells you to run — produces 44
 * characters. Anything materially shorter is not a secret somebody chose, it is
 * a placeholder somebody forgot, so it fails the boot rather than quietly
 * signing sessions with eight characters of "changeme".
 */
const MIN_AUTH_SECRET_LENGTH = 32

/** Mirrors the BASE64 test in credentials-key.ts. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Must stay in step with the `switch` in `getStorage()`
 * (src/server/storage/index.ts) — that function is the authority on what the app
 * can actually do with the value, this list is only what lets a typo fail at
 * boot instead of at the first upload. Phase 7's cloud driver adds an entry in
 * both places.
 */
export const SUPPORTED_STORAGE_DRIVERS = ["local"] as const

/** What `getStorage()` falls back to, so an unset variable is not a problem. */
export const DEFAULT_STORAGE_DRIVER = "local"

/** The subset of `process.env` this module reads. Passed in rather than read
 *  from the global so the rules can be exercised against a fixture without a
 *  test mutating the environment every other test in the file shares. */
export type EnvSource = Record<string, string | undefined>

export class EnvValidationError extends Error {
  /** One entry per broken variable, in declaration order. */
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      `Environment validation failed:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
        `See .env.example for what each variable is and how to generate it.`
    )
    this.name = "EnvValidationError"
    this.problems = problems
  }
}

function read(env: EnvSource, name: string): string | undefined {
  const raw = env[name]
  // A variable set to "" or to whitespace is the shape a shell produces from an
  // unset reference (`AUTH_SECRET=$MISSING`), and it is not a value. Treating it
  // as absent is what makes the error say "is not set" instead of letting an
  // empty string through to be a zero-length signing secret.
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === "" ? undefined : trimmed
}

/**
 * True only if `raw` is base64 for exactly `bytes` bytes.
 *
 * The re-encode is not decoration: Node's base64 decoder SKIPS characters it
 * does not recognise, so `Buffer.from(x, "base64").byteLength` alone accepts a
 * 32-byte key with a chunk of prose glued to it. Same check, and the same
 * reason, as decodeOrThrow in credentials-key.ts.
 */
function isBase64OfLength(raw: string, bytes: number): boolean {
  if (!BASE64.test(raw)) return false
  const decoded = Buffer.from(raw, "base64")
  if (decoded.byteLength !== bytes) return false
  return decoded.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")
}

/**
 * Every reason this environment cannot serve traffic, as sentences naming the
 * variable. Empty means the environment is usable.
 *
 * Exported separately from `validateEnv` so a caller that wants to report rather
 * than die — a health check, a `doctor` command — does not have to catch.
 */
export function collectEnvProblems(env: EnvSource = process.env): string[] {
  const problems: string[] = []

  // --- DATABASE_URL ------------------------------------------------------
  const databaseUrl = read(env, "DATABASE_URL")
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set. Prisma cannot connect without it.")
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    // @prisma/adapter-pg speaks Postgres and nothing else. A URL for another
    // engine fails deep inside `pg` with a message about the protocol, several
    // layers away from the variable that caused it.
    problems.push("DATABASE_URL must be a postgres:// or postgresql:// connection string.")
  }

  // --- AUTH_SECRET -------------------------------------------------------
  // NEXTAUTH_SECRET is accepted because next-auth itself accepts it
  // (`config.secret ??= process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET`
  // in next-auth/lib/env.js). Rejecting a name the library honours would fail a
  // deploy that actually works.
  const authSecret = read(env, "AUTH_SECRET") ?? read(env, "NEXTAUTH_SECRET")
  if (!authSecret) {
    problems.push(
      "AUTH_SECRET is not set. Sessions cannot be signed; generate one with: openssl rand -base64 32"
    )
  } else if (authSecret.length < MIN_AUTH_SECRET_LENGTH) {
    problems.push(
      `AUTH_SECRET is shorter than ${MIN_AUTH_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`
    )
  }

  // --- CREDENTIALS_KEY ---------------------------------------------------
  // src/server/crypto/credentials-key.ts remains the authority: it is what the
  // encryption path calls, and it applies these same three rules at use time.
  // They are repeated here so a truncated or copy-pasted key fails the BOOT
  // rather than the first time a user opens the credential vault — by which
  // point the deploy has been declared successful.
  const credentialsKey = read(env, "CREDENTIALS_KEY")
  if (!credentialsKey) {
    problems.push(
      "CREDENTIALS_KEY is not set. Stored credentials cannot be encrypted; generate one with: openssl rand -base64 32"
    )
  } else if (!isBase64OfLength(credentialsKey, CREDENTIALS_KEY_BYTES)) {
    problems.push(
      `CREDENTIALS_KEY must be exactly ${CREDENTIALS_KEY_BYTES} bytes of base64 (44 characters from: openssl rand -base64 32).`
    )
  } else if (authSecret && credentialsKey === authSecret) {
    // The likeliest configuration mistake, and the one with the widest blast
    // radius: one secret doing session signing AND vault encryption welds the
    // two together, so rotating either forces the other and leaking either
    // leaks both (§9.2).
    problems.push(
      "CREDENTIALS_KEY must not be the same value as AUTH_SECRET. They have different lifecycles and different blast radii."
    )
  }

  // Absent is the normal state — it only exists during a key rotation. Present
  // and malformed is not normal, and credentials-key.ts throws on it, which
  // would take down the credential list rather than one row.
  const previousKey = read(env, "CREDENTIALS_KEY_PREVIOUS")
  if (previousKey && !isBase64OfLength(previousKey, CREDENTIALS_KEY_BYTES)) {
    problems.push(
      `CREDENTIALS_KEY_PREVIOUS is set but is not ${CREDENTIALS_KEY_BYTES} bytes of base64. Remove it once the rotation is finished, or fix it.`
    )
  }

  // --- STORAGE_DRIVER ----------------------------------------------------
  // Unset is fine and means "local" — `getStorage()` defaults the same way, and
  // .env carries no STORAGE_DRIVER today. Set-but-unknown is the case worth
  // catching: it is a typo, and the only alternative to failing is writing
  // production resumes to a container's ephemeral disk.
  const storageDriver = read(env, "STORAGE_DRIVER")
  if (storageDriver && !(SUPPORTED_STORAGE_DRIVERS as readonly string[]).includes(storageDriver)) {
    problems.push(
      `STORAGE_DRIVER is not a supported driver. Supported drivers: ${SUPPORTED_STORAGE_DRIVERS.join(", ")}.`
    )
  }

  // --- NEXT_PUBLIC_APP_URL -----------------------------------------------
  // Optional, but next.config.ts derives `serverActions.allowedOrigins` from its
  // host. A value that does not parse yields an EMPTY allow-list, which is
  // invisible until a Server Action behind a reverse proxy is rejected as CSRF.
  const appUrl = read(env, "NEXT_PUBLIC_APP_URL")
  if (appUrl && !parsesAsHttpUrl(appUrl)) {
    problems.push(
      "NEXT_PUBLIC_APP_URL must be an absolute http(s) URL, e.g. https://app.example.com"
    )
  }

  return problems
}

function parsesAsHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Throw unless the environment can serve traffic. Call once, as early in the
 * process as the app can reach.
 */
export function validateEnv(env: EnvSource = process.env): void {
  const problems = collectEnvProblems(env)
  if (problems.length > 0) throw new EnvValidationError(problems)
}

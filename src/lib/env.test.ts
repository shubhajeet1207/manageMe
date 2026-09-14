import { describe, expect, it } from "vitest"
import {
  collectEnvProblems,
  EnvValidationError,
  SUPPORTED_STORAGE_DRIVERS,
  validateEnv,
  type EnvSource,
} from "./env"

/** 32 bytes of base64 — the shape `openssl rand -base64 32` produces. */
const VALID_KEY = Buffer.alloc(32, 0x2a).toString("base64")
const OTHER_VALID_KEY = Buffer.alloc(32, 0x5b).toString("base64")

/**
 * Also 44 characters, and also pure base64 — but 31 bytes. A rule written as
 * "must be 44 characters" passes this, which is why the module counts DECODED
 * bytes.
 */
const THIRTY_ONE_BYTE_KEY = Buffer.alloc(31, 0x2a).toString("base64")

/**
 * 32 zero bytes with the two unused trailing bits of the last base64 character
 * set. Node decodes it to the correct byte length and re-encodes it to
 * something else — the case a `byteLength` check alone waves through, because
 * Node's decoder is permissive about input it did not produce.
 */
const NON_CANONICAL_KEY = "A".repeat(42) + "B="

const VALID: EnvSource = {
  DATABASE_URL: "postgresql://user:pw@host.example/db?sslmode=verify-full",
  AUTH_SECRET: OTHER_VALID_KEY,
  CREDENTIALS_KEY: VALID_KEY,
}

function envWith(overrides: EnvSource): EnvSource {
  return { ...VALID, ...overrides }
}

/** Every problem mentioning `name`. Used instead of matching whole sentences so
 *  a reworded message does not fail a test about which VARIABLE was named. */
function problemsFor(env: EnvSource, name: string): string[] {
  return collectEnvProblems(env).filter((p) => p.includes(name))
}

describe("collectEnvProblems", () => {
  // Without this, every "X is rejected" assertion below could be passing for
  // the wrong reason — a baseline that is itself broken makes them all vacuous.
  it("reports nothing for a complete environment", () => {
    expect(collectEnvProblems(VALID)).toEqual([])
  })

  describe("DATABASE_URL", () => {
    it("names it when unset", () => {
      expect(problemsFor(envWith({ DATABASE_URL: undefined }), "DATABASE_URL")).toHaveLength(1)
    })

    // @prisma/adapter-pg speaks Postgres only; a mysql:// URL otherwise fails
    // several layers down inside `pg`, nowhere near the variable that caused it.
    it("rejects a non-postgres connection string", () => {
      expect(problemsFor(envWith({ DATABASE_URL: "mysql://user@host/db" }), "DATABASE_URL")).toHaveLength(1)
    })

    it("accepts both postgres:// and postgresql://", () => {
      expect(collectEnvProblems(envWith({ DATABASE_URL: "postgres://u@h/d" }))).toEqual([])
      expect(collectEnvProblems(envWith({ DATABASE_URL: "postgresql://u@h/d" }))).toEqual([])
    })
  })

  describe("AUTH_SECRET", () => {
    it("names it when unset", () => {
      expect(problemsFor(envWith({ AUTH_SECRET: undefined }), "AUTH_SECRET")).toHaveLength(1)
    })

    // `AUTH_SECRET=$TYPO` in a deploy script produces an empty string, not an
    // absent variable. Letting it through means signing every session with "".
    it.each(["", "   ", "\n\t"])("treats %j as unset rather than as a secret", (blank) => {
      expect(problemsFor(envWith({ AUTH_SECRET: blank }), "AUTH_SECRET")).toHaveLength(1)
    })

    it("rejects a secret too short to be one", () => {
      expect(problemsFor(envWith({ AUTH_SECRET: "changeme" }), "AUTH_SECRET")).toHaveLength(1)
    })

    // next-auth reads AUTH_SECRET ?? NEXTAUTH_SECRET, so a deploy carrying only
    // the legacy name works. Failing it here would break a working deploy.
    it("accepts NEXTAUTH_SECRET as the alias next-auth itself honours", () => {
      const env = envWith({ AUTH_SECRET: undefined, NEXTAUTH_SECRET: OTHER_VALID_KEY })
      expect(collectEnvProblems(env)).toEqual([])
    })
  })

  describe("CREDENTIALS_KEY", () => {
    it("names it when unset", () => {
      expect(problemsFor(envWith({ CREDENTIALS_KEY: undefined }), "CREDENTIALS_KEY")).toHaveLength(1)
    })

    it("rejects a key that is 44 characters but only 31 bytes", () => {
      // Proves the fixture is the trap it claims to be, not just a bad string.
      expect(THIRTY_ONE_BYTE_KEY).toHaveLength(VALID_KEY.length)
      expect(problemsFor(envWith({ CREDENTIALS_KEY: THIRTY_ONE_BYTE_KEY }), "CREDENTIALS_KEY")).toHaveLength(1)
    })

    it("rejects base64 that decodes to 32 bytes but is not what 32 bytes encode to", () => {
      // Proves the byteLength check alone would let this through.
      expect(Buffer.from(NON_CANONICAL_KEY, "base64").byteLength).toBe(32)
      expect(problemsFor(envWith({ CREDENTIALS_KEY: NON_CANONICAL_KEY }), "CREDENTIALS_KEY")).toHaveLength(1)
    })

    it("rejects a value that merely contains base64", () => {
      const env = envWith({ CREDENTIALS_KEY: `CREDENTIALS_KEY=${VALID_KEY}` })
      expect(problemsFor(env, "CREDENTIALS_KEY")).toHaveLength(1)
    })

    // §9.2: one secret doing session signing AND vault encryption welds two
    // blast radii together in both directions. It is also the single likeliest
    // copy-paste when filling in a fresh .env.
    it("rejects a key copy-pasted from AUTH_SECRET", () => {
      const env = envWith({ AUTH_SECRET: VALID_KEY, CREDENTIALS_KEY: VALID_KEY })
      expect(problemsFor(env, "CREDENTIALS_KEY").some((p) => p.includes("AUTH_SECRET"))).toBe(true)
    })

    it("does not mistake two different well-formed keys for a copy-paste", () => {
      expect(collectEnvProblems(VALID)).toEqual([])
    })
  })

  describe("CREDENTIALS_KEY_PREVIOUS", () => {
    // Absent is the normal state: it exists only mid-rotation.
    it("is not required", () => {
      expect(collectEnvProblems(envWith({ CREDENTIALS_KEY_PREVIOUS: undefined }))).toEqual([])
    })

    it("accepts a well-formed previous key", () => {
      expect(collectEnvProblems(envWith({ CREDENTIALS_KEY_PREVIOUS: OTHER_VALID_KEY }))).toEqual([])
    })

    // credentials-key.ts throws on a malformed one rather than ignoring it, so
    // a bad value here takes the whole credential list down at first read.
    it("rejects a malformed previous key", () => {
      const env = envWith({ CREDENTIALS_KEY_PREVIOUS: THIRTY_ONE_BYTE_KEY })
      expect(problemsFor(env, "CREDENTIALS_KEY_PREVIOUS")).toHaveLength(1)
    })
  })

  describe("STORAGE_DRIVER", () => {
    // getStorage() defaults to "local" and .env carries no STORAGE_DRIVER, so
    // requiring it would fail every environment that works today.
    it("is optional", () => {
      expect(collectEnvProblems(envWith({ STORAGE_DRIVER: undefined }))).toEqual([])
    })

    it.each(SUPPORTED_STORAGE_DRIVERS)("accepts the supported driver %s", (driver) => {
      expect(collectEnvProblems(envWith({ STORAGE_DRIVER: driver }))).toEqual([])
    })

    it("names it when set to a driver getStorage() cannot build", () => {
      expect(problemsFor(envWith({ STORAGE_DRIVER: "s3" }), "STORAGE_DRIVER")).toHaveLength(1)
    })
  })

  describe("NEXT_PUBLIC_APP_URL", () => {
    it("is optional", () => {
      expect(collectEnvProblems(envWith({ NEXT_PUBLIC_APP_URL: undefined }))).toEqual([])
    })

    it("accepts an absolute http(s) URL", () => {
      expect(collectEnvProblems(envWith({ NEXT_PUBLIC_APP_URL: "https://app.example.com" }))).toEqual([])
    })

    // next.config.ts takes `.host` off this to build serverActions.allowedOrigins.
    // A bare hostname yields an empty allow-list, and the symptom is a Server
    // Action rejected as CSRF behind a proxy — nowhere near this variable.
    it.each(["app.example.com", "ftp://app.example.com", "not a url"])(
      "rejects %j, which would silently produce an empty allowedOrigins list",
      (value) => {
        expect(problemsFor(envWith({ NEXT_PUBLIC_APP_URL: value }), "NEXT_PUBLIC_APP_URL")).toHaveLength(1)
      }
    )
  })

  // One restart should be enough to learn everything that is wrong. Reporting
  // only the first problem turns a misconfigured deploy into a guessing game.
  it("reports every broken variable at once, not just the first", () => {
    const problems = collectEnvProblems({})
    expect(problems.some((p) => p.includes("DATABASE_URL"))).toBe(true)
    expect(problems.some((p) => p.includes("AUTH_SECRET"))).toBe(true)
    expect(problems.some((p) => p.includes("CREDENTIALS_KEY"))).toBe(true)
  })
})

describe("validateEnv", () => {
  it("does not throw for a complete environment", () => {
    expect(() => validateEnv(VALID)).not.toThrow()
  })

  it("throws EnvValidationError carrying every problem", () => {
    try {
      validateEnv({})
      expect.unreachable("validateEnv should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const problems = (error as EnvValidationError).problems
      expect(problems.length).toBeGreaterThanOrEqual(3)
      // The message is what a deploy log shows; the array is for programmatic
      // callers. Both have to carry the variable names or the error is useless.
      for (const problem of problems) {
        expect((error as EnvValidationError).message).toContain(problem)
      }
    }
  })

  // These variables are a database password, a session-signing secret and an
  // AES-256 key. An error that echoed them is how key material reaches a log
  // aggregator — the same rule credentials-key.ts and secret-box.ts hold to.
  it("never puts a value in the message", () => {
    // Every value carries a random-looking token so a substring match cannot
    // succeed by accident against ordinary English in the message.
    const env: EnvSource = {
      DATABASE_URL: "mysql://user:hunter2-Nb5@host/db",
      AUTH_SECRET: "Zq7",
      CREDENTIALS_KEY: THIRTY_ONE_BYTE_KEY,
      CREDENTIALS_KEY_PREVIOUS: NON_CANONICAL_KEY,
      STORAGE_DRIVER: "gcs-Kt9",
      NEXT_PUBLIC_APP_URL: "wv3-not-a-url",
    }

    let message = ""
    try {
      validateEnv(env)
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).not.toBe("")
    for (const value of Object.values(env)) {
      expect(message).not.toContain(value)
    }
  })
})

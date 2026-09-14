import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

function createPrismaClient() {
  // Read INSIDE the factory, not at module scope. At module scope this threw
  // while Next was collecting page data during the build — `/api/auth/[...nextauth]`
  // imports auth.ts -> auth-service -> user-repository -> this file, so merely
  // evaluating the route needed a database URL. Building an app should not
  // require credentials for the database it will later talk to, and on Vercel a
  // variable marked "Sensitive" is deliberately absent at build time.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set")
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    // Deny by default. These three columns are excluded from EVERY query in the
    // app unless a query opts back in, and exactly two do:
    // credentialRepository.findSealedById on the reveal path and
    // listSealedByUser on the re-encryption walk. Client-level rather than
    // per-query on purpose — it also covers a future
    // `include: { credentials: true }` on a user query written by someone who
    // has never read the Phase 5 spec.
    omit: {
      credential: {
        secretCiphertext: true,
        secretNonce: true,
        secretAuthTag: true,
      },
    },
  })
}

// Typed from the factory rather than as a bare `PrismaClient`: the omit above is
// part of the client's TYPE, and annotating the cache with the unparameterised
// client would throw that away and make every credential read look like it
// still carries a ciphertext.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>
}

let client: ReturnType<typeof createPrismaClient> | undefined

function getClient(): ReturnType<typeof createPrismaClient> {
  if (client) return client
  if (globalForPrisma.prisma) {
    client = globalForPrisma.prisma
    return client
  }
  client = createPrismaClient()
  // Dev only: survives HMR, which would otherwise leak a connection pool per
  // edit. In production each lambda instance holds its own `client` above.
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client
  }
  return client
}

/**
 * Lazy by construction: the client — and the DATABASE_URL check inside it — is
 * built on first property access, never on import. Every call site keeps using
 * `prisma.user.findFirst(...)` unchanged.
 *
 * Methods are bound to the real client because Prisma's delegates rely on their
 * own `this`; returning them unbound would break the moment one was destructured.
 */
export const prisma = new Proxy({} as ReturnType<typeof createPrismaClient>, {
  get(_target, property) {
    const actual = getClient()
    const value = Reflect.get(actual, property, actual)
    return typeof value === "function" ? value.bind(actual) : value
  },
})

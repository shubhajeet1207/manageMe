import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

function createPrismaClient() {
  return new PrismaClient({
    adapter,
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

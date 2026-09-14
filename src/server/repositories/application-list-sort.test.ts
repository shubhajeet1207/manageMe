import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { ApplicationStatus } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import {
  APPLICATION_SORT_KEYS,
  SORT_DIRECTIONS,
  type ApplicationSortKey,
  type SortDirection,
} from "@/lib/application-sort"
import { STATUS_ORDER } from "@/lib/status-order"
import * as applicationRepository from "./application-repository"

type Fixture = {
  role: string
  company: string
  status: ApplicationStatus
  appliedAt: string | null
  updatedAt: string
}

/**
 * Five rows chosen so that every sort key produces a DIFFERENT order from every
 * other — see the expectations below, which are all distinct permutations. A
 * fixture where two orders coincided would let a query that sorts by the wrong
 * column pass a test for the right one.
 *
 * Two of them share a company AND a status, which is the only way to see
 * whether the tiebreak survives; and two have no applied date, which is the
 * only way to see where NULLs land.
 */
const OWNED: Fixture[] = [
  {
    role: "Architect",
    company: "Delta",
    status: "OFFER",
    appliedAt: "2026-03-01",
    updatedAt: "2026-01-04",
  },
  {
    role: "Zookeeper",
    company: "Magnus",
    status: "SAVED",
    appliedAt: null,
    updatedAt: "2026-01-03",
  },
  {
    role: "Machinist",
    company: "Zenith",
    status: "REJECTED",
    appliedAt: "2026-01-15",
    updatedAt: "2026-01-02",
  },
  {
    role: "Yardmaster",
    company: "Beacon",
    status: "SCREENING",
    appliedAt: "2026-02-01",
    updatedAt: "2026-01-01",
  },
  {
    role: "Xenolith",
    company: "Beacon",
    status: "SCREENING",
    appliedAt: null,
    updatedAt: "2026-01-05",
  },
]

/**
 * A second user's rows, built to sort to one END or the other under every key:
 * first alphabetically by company and role, first and last along the pipeline,
 * and dated far outside the owner's range. If the ownership filter were ever
 * dropped from a sorted query, these would not merely appear — they would
 * appear at the top of the page.
 */
const INTRUDER: Fixture[] = [
  {
    role: "Aardvark",
    company: "Aardvark Holdings",
    status: "SAVED",
    appliedAt: "2099-01-01",
    updatedAt: "2099-01-01",
  },
  {
    role: "Zymurgist",
    company: "Zymurgy Labs",
    status: "REJECTED",
    appliedAt: "1990-01-01",
    updatedAt: "1990-01-01",
  },
]

const DEFAULT_ORDER = ["Xenolith", "Architect", "Zookeeper", "Machinist", "Yardmaster"]

/** Every allowlisted key in both directions, with the exact order it must
 *  produce against `OWNED`. */
const EXPECTED: Array<[ApplicationSortKey, SortDirection, string[]]> = [
  ["updated", "desc", DEFAULT_ORDER],
  ["updated", "asc", ["Yardmaster", "Machinist", "Zookeeper", "Architect", "Xenolith"]],
  // Beacon is shared by Xenolith and Yardmaster; the tiebreak is the default
  // order, so the more recently updated of the two comes first.
  ["company", "asc", ["Xenolith", "Yardmaster", "Architect", "Zookeeper", "Machinist"]],
  ["company", "desc", ["Machinist", "Zookeeper", "Architect", "Xenolith", "Yardmaster"]],
  ["role", "asc", ["Architect", "Machinist", "Xenolith", "Yardmaster", "Zookeeper"]],
  ["role", "desc", ["Zookeeper", "Yardmaster", "Xenolith", "Machinist", "Architect"]],
  // SAVED, SCREENING, SCREENING, OFFER, REJECTED. Alphabetically this would be
  // OFFER, REJECTED, SAVED, SCREENING, SCREENING — a different permutation, so
  // this expectation cannot be satisfied by an alphabetical sort.
  ["status", "asc", ["Zookeeper", "Xenolith", "Yardmaster", "Architect", "Machinist"]],
  ["status", "desc", ["Machinist", "Architect", "Xenolith", "Yardmaster", "Zookeeper"]],
  // Rows with no applied date sink to the bottom in BOTH directions.
  ["applied", "desc", ["Architect", "Yardmaster", "Machinist", "Xenolith", "Zookeeper"]],
  ["applied", "asc", ["Machinist", "Yardmaster", "Architect", "Xenolith", "Zookeeper"]],
]

const createdUserIds: string[] = []

/** Written with `prisma.application.create` rather than the repository because
 *  these rows need specific `updatedAt` values, and because the subject here is
 *  the read path — no status history is involved (§7.6). */
async function seed(rows: Fixture[]) {
  const user = await prisma.user.create({
    data: {
      name: "Sort Test",
      email: `app-sort-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)

  const companyIds = new Map<string, string>()
  for (const name of new Set(rows.map((row) => row.company))) {
    const company = await prisma.company.create({ data: { userId: user.id, name } })
    companyIds.set(name, company.id)
  }

  await prisma.application.createMany({
    data: rows.map((row) => ({
      userId: user.id,
      companyId: companyIds.get(row.company)!,
      roleTitle: row.role,
      status: row.status,
      appliedAt: row.appliedAt ? new Date(row.appliedAt) : null,
      updatedAt: new Date(row.updatedAt),
    })),
  })

  return { userId: user.id, companyIds }
}

let ownerId: string
let ownerCompanyIds: Map<string, string>

beforeAll(async () => {
  const owner = await seed(OWNED)
  ownerId = owner.userId
  ownerCompanyIds = owner.companyIds
  await seed(INTRUDER)
}, 60_000)

afterAll(async () => {
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.application.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("listByUser sorting", () => {
  it("orders by most recently updated when no sort is given, as it always has", async () => {
    const rows = await applicationRepository.listByUser(ownerId)
    expect(rows.map((row) => row.roleTitle)).toEqual(DEFAULT_ORDER)
  })

  it.each(EXPECTED)("orders by %s %s", async (key, direction, expected) => {
    const rows = await applicationRepository.listByUser(ownerId, { key, direction })
    expect(rows.map((row) => row.roleTitle)).toEqual(expected)
  })

  // A key added to the allowlist without an expectation above would otherwise
  // ship untested — the switch in the repository would compile, and nothing
  // would check what it actually returns.
  it("has an expectation for every allowlisted key in both directions", () => {
    expect(EXPECTED.map(([key, direction]) => `${key} ${direction}`).sort()).toEqual(
      APPLICATION_SORT_KEYS.flatMap((key) =>
        SORT_DIRECTIONS.map((direction) => `${key} ${direction}`)
      ).sort()
    )
  })

  it("orders status by pipeline position, not alphabetically", async () => {
    const rows = await applicationRepository.listByUser(ownerId, {
      key: "status",
      direction: "asc",
    })
    const statuses = rows.map((row) => row.status)

    const ranks = statuses.map((status) => STATUS_ORDER.indexOf(status))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    // ACCEPTED before SAVED is the answer an alphabetical sort gives, and it is
    // meaningless to a user. Naming it here keeps the test from passing just
    // because both orders happened to agree on this fixture.
    expect(statuses).not.toEqual([...statuses].sort())
    expect(statuses[0]).toBe("SAVED")
    expect(statuses[statuses.length - 1]).toBe("REJECTED")
  })

  it("keeps rows that share a status in the default order beneath it", async () => {
    const rows = await applicationRepository.listByUser(ownerId, {
      key: "status",
      direction: "asc",
    })
    const screening = rows.filter((row) => row.status === "SCREENING").map((row) => row.roleTitle)
    // Xenolith was updated 2026-01-05, Yardmaster 2026-01-01. An unstable
    // reorder would be free to swap them.
    expect(screening).toEqual(["Xenolith", "Yardmaster"])
  })

  it.each(SORT_DIRECTIONS)(
    "sinks applications with no applied date to the bottom when sorting applied %s",
    async (direction) => {
      const rows = await applicationRepository.listByUser(ownerId, { key: "applied", direction })
      const undated = rows.slice(-2)
      // Postgres puts NULLs FIRST on a descending sort by default, which would
      // open "most recently applied" on the rows never applied to at all.
      expect(undated.every((row) => row.appliedAt === null)).toBe(true)
      expect(rows.slice(0, -2).every((row) => row.appliedAt !== null)).toBe(true)
    }
  )

  describe("an invalid sort key falls back rather than throwing", () => {
    // Every one of these reaches a bare object index or an `in` check as a real
    // property in the version of this code that does not use an array
    // allowlist — which is how `?status=toString` once 500'd this page.
    it.each([
      "toString",
      "constructor",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "roleTitle",
      "updatedAt",
      "company.name",
      "",
      "ROLE",
      "not-a-column",
    ])("falls back to the default order for ?sort=%o", async (key) => {
      // Direction "asc" is deliberate: a fallback that kept the direction and
      // only replaced the key would return updated ASCENDING, which is the
      // reverse of the default and would be caught here.
      const rows = await applicationRepository.listByUser(ownerId, { key, direction: "asc" })
      expect(rows.map((row) => row.roleTitle)).toEqual(DEFAULT_ORDER)
    })

    it("keeps a valid column when only the direction is junk", async () => {
      const rows = await applicationRepository.listByUser(ownerId, {
        key: "role",
        direction: "sideways",
      })
      expect(rows.map((row) => row.roleTitle)).toEqual([
        "Architect",
        "Machinist",
        "Xenolith",
        "Yardmaster",
        "Zookeeper",
      ])
    })
  })

  describe("ownership", () => {
    it.each(APPLICATION_SORT_KEYS)(
      "returns no other user's rows when sorting by %s",
      async (key) => {
        for (const direction of SORT_DIRECTIONS) {
          const rows = await applicationRepository.listByUser(ownerId, { key, direction })
          expect(rows.map((row) => row.roleTitle).sort()).toEqual(
            OWNED.map((row) => row.role).sort()
          )
        }
      }
    )

    it("returns nothing for a user with no applications, whatever the sort", async () => {
      const stranger = await seed([])
      for (const key of APPLICATION_SORT_KEYS) {
        expect(await applicationRepository.listByUser(stranger.userId, { key })).toHaveLength(0)
      }
    })
  })
})

describe("listByCompany sorting", () => {
  it("defaults to most recently updated, as it always has", async () => {
    const rows = await applicationRepository.listByCompany(
      ownerId,
      ownerCompanyIds.get("Beacon")!
    )
    expect(rows.map((row) => row.roleTitle)).toEqual(["Xenolith", "Yardmaster"])
  })

  it("takes the same sort parameter", async () => {
    const rows = await applicationRepository.listByCompany(
      ownerId,
      ownerCompanyIds.get("Beacon")!,
      { key: "updated", direction: "asc" }
    )
    expect(rows.map((row) => row.roleTitle)).toEqual(["Yardmaster", "Xenolith"])
  })

  it("falls back to the default for an invalid key", async () => {
    const rows = await applicationRepository.listByCompany(
      ownerId,
      ownerCompanyIds.get("Beacon")!,
      { key: "toString", direction: "asc" }
    )
    expect(rows.map((row) => row.roleTitle)).toEqual(["Xenolith", "Yardmaster"])
  })

  it("returns nothing for another user's company under any sort", async () => {
    const stranger = await seed([])
    for (const key of APPLICATION_SORT_KEYS) {
      const rows = await applicationRepository.listByCompany(
        stranger.userId,
        ownerCompanyIds.get("Beacon")!,
        { key }
      )
      expect(rows).toHaveLength(0)
    }
  })
})

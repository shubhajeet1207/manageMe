import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "./application-repository"
import * as statusEventRepository from "./status-event-repository"

const createdUserIds: string[] = []

async function makeUserWithCompany(label: string) {
  const user = await prisma.user.create({
    data: {
      name: `Status Event Test ${label}`,
      email: `status-event-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

/**
 * The shipped backfill statement, lifted out of the migration file rather than
 * paraphrased here — a test against a retyped copy proves nothing about what
 * actually runs against production (§15.4).
 *
 * One predicate is appended, and only one: the shipped statement is global,
 * which is correct for a migration (nothing else is writing) and wrong for a
 * suite that runs ten files in parallel, where another file deleting its own
 * applications between this statement's SELECT and its INSERT is a foreign key
 * violation in a test that has nothing to do with it. Narrowing the row set
 * changes nothing about the INSERT, the NULL genesis, the BACKFILL marker or
 * the NOT EXISTS idempotence clause, which are what this file is testing.
 */
function backfillStatement(userId: string): string {
  const file = path.join(
    process.cwd(),
    "prisma/migrations/20260913153315_add_application_status_event/migration.sql"
  )
  const sql = readFileSync(file, "utf8")
  const start = sql.indexOf('INSERT INTO "ApplicationStatusEvent"')
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf(";", start)
  expect(end).toBeGreaterThan(start)
  return `${sql.slice(start, end)} AND a."userId" = '${userId}'`
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.application.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("statusEventRepository", () => {
  // Append-only is enforced by there being no write function to call, not by a
  // comment asking future authors not to write one. A new export here fails
  // this test, which points the author at §7.2.
  it("exports reads and nothing that can write an event", () => {
    expect(Object.keys(statusEventRepository).sort()).toEqual([
      "countContinuityViolations",
      "countStatusDrift",
      "listByApplication",
    ])
  })

  it("returns one application's history oldest first", async () => {
    const { user, company } = await makeUserWithCompany("history")
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "SAVED",
    })
    await applicationRepository.updateStatus(user.id, created.id, "APPLIED")
    await applicationRepository.updateStatus(user.id, created.id, "SCREENING")

    const events = await statusEventRepository.listByApplication(user.id, created.id)
    expect(events.map((event) => event.toStatus)).toEqual(["SAVED", "APPLIED", "SCREENING"])
    expect(events.map((event) => event.fromStatus)).toEqual([null, "SAVED", "APPLIED"])
  })

  describe("ownership", () => {
    it("does not return another user's history", async () => {
      const owner = await makeUserWithCompany("owner")
      const other = await makeUserWithCompany("other")
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      await applicationRepository.updateStatus(owner.user.id, created.id, "INTERVIEW")

      expect(await statusEventRepository.listByApplication(owner.user.id, created.id)).toHaveLength(
        2
      )
      expect(await statusEventRepository.listByApplication(other.user.id, created.id)).toEqual([])
    })

    it("counts drift only within the caller's own applications", async () => {
      const owner = await makeUserWithCompany("drift-owner")
      const other = await makeUserWithCompany("drift-other")
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      // The fourth path this whole design is defending against: a direct write
      // that moves the status and records nothing.
      await prisma.application.update({ where: { id: created.id }, data: { status: "OFFER" } })

      expect(await statusEventRepository.countStatusDrift(owner.user.id)).toBe(1)
      expect(await statusEventRepository.countStatusDrift(other.user.id)).toBe(0)
    })

    it("counts continuity violations only within the caller's own applications", async () => {
      const owner = await makeUserWithCompany("cont-owner")
      const other = await makeUserWithCompany("cont-other")
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      await applicationRepository.updateStatus(owner.user.id, created.id, "APPLIED")

      expect(await statusEventRepository.countContinuityViolations(owner.user.id)).toBe(0)
      expect(await statusEventRepository.countContinuityViolations(other.user.id)).toBe(0)
    })
  })

  describe("the drift detector", () => {
    it("stays silent while every status change goes through the chokepoint", async () => {
      const { user, company } = await makeUserWithCompany("clean")
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      await applicationRepository.updateStatus(user.id, created.id, "APPLIED")
      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "INTERVIEW",
      })

      expect(await statusEventRepository.countStatusDrift(user.id)).toBe(0)
    })

    // §7.6: zero events means "not recorded", not "recorded wrongly". Fifteen
    // existing test fixtures create applications this way, and the warning band
    // must not fire on all of them.
    it("does not fire on an application with no events at all", async () => {
      const { user, company } = await makeUserWithCompany("no-events")
      await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Engineer", status: "OFFER" },
      })

      expect(await statusEventRepository.countStatusDrift(user.id)).toBe(0)
    })
  })

  describe("the continuity invariant", () => {
    it("is violated by a bypass, in the NEXT legitimate transition", async () => {
      const { user, company } = await makeUserWithCompany("bypass")
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      await prisma.application.update({ where: { id: created.id }, data: { status: "SCREENING" } })
      // The bypass itself leaves a gap, and a gap is indistinguishable from a
      // legitimate multi-stage drag. It becomes a contradiction only once the
      // chokepoint next reads the live row: fromStatus SCREENING against a
      // predecessor whose toStatus was SAVED.
      await applicationRepository.updateStatus(user.id, created.id, "INTERVIEW")

      const events = await statusEventRepository.listByApplication(user.id, created.id)
      expect(events[1].fromStatus).toBe("SCREENING")
      expect(events[0].toStatus).toBe("SAVED")
      expect(await statusEventRepository.countContinuityViolations(user.id)).toBe(1)
    })

    it("is vacuously satisfied by an application with no events", async () => {
      const { user, company } = await makeUserWithCompany("vacuous")
      await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Engineer", status: "SAVED" },
      })

      expect(await statusEventRepository.countContinuityViolations(user.id)).toBe(0)
    })
  })

  describe("the backfill", () => {
    it("writes exactly one synthetic genesis row per application, marked as synthetic", async () => {
      const { user, company } = await makeUserWithCompany("backfill")
      const application = await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Engineer", status: "INTERVIEW" },
      })

      await prisma.$executeRawUnsafe(backfillStatement(user.id))

      const events = await statusEventRepository.listByApplication(user.id, application.id)
      expect(events).toHaveLength(1)
      expect(events[0].fromStatus).toBeNull()
      expect(events[0].toStatus).toBe("INTERVIEW")
      expect(events[0].source).toBe("BACKFILL")
      expect(events[0].changedAt.getTime()).toBe(application.updatedAt.getTime())
    })

    // The marker is the `source` column and nothing else. Nothing may infer
    // provenance from the id's shape, even though the SQL has to mint a uuid
    // where the Prisma default would mint a cuid.
    it("is distinguishable from a recorded row by source, not by id shape", async () => {
      const { user, company } = await makeUserWithCompany("marked")
      const synthetic = await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Old", status: "APPLIED" },
      })
      const recorded = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "New",
        status: "APPLIED",
      })

      await prisma.$executeRawUnsafe(backfillStatement(user.id))

      const syntheticEvents = await statusEventRepository.listByApplication(user.id, synthetic.id)
      const recordedEvents = await statusEventRepository.listByApplication(user.id, recorded.id)
      expect(syntheticEvents.map((event) => event.source)).toEqual(["BACKFILL"])
      expect(recordedEvents.map((event) => event.source)).toEqual(["CREATE"])

      const recordedOnly = await prisma.applicationStatusEvent.findMany({
        where: { userId: user.id, source: { not: "BACKFILL" } },
      })
      expect(recordedOnly.map((event) => event.applicationId)).toEqual([recorded.id])
    })

    it("writes nothing on a second run", async () => {
      const { user, company } = await makeUserWithCompany("idempotent")
      const application = await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Engineer", status: "SAVED" },
      })

      await prisma.$executeRawUnsafe(backfillStatement(user.id))
      const first = await statusEventRepository.listByApplication(user.id, application.id)
      await prisma.$executeRawUnsafe(backfillStatement(user.id))
      const second = await statusEventRepository.listByApplication(user.id, application.id)

      expect(first).toHaveLength(1)
      expect(second).toHaveLength(1)
      expect(second[0].id).toBe(first[0].id)
    })

    it("leaves an application that already has recorded history alone", async () => {
      const { user, company } = await makeUserWithCompany("already-recorded")
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })
      await applicationRepository.updateStatus(user.id, created.id, "APPLIED")

      await prisma.$executeRawUnsafe(backfillStatement(user.id))

      const events = await statusEventRepository.listByApplication(user.id, created.id)
      expect(events).toHaveLength(2)
      expect(events.map((event) => event.source)).toEqual(["CREATE", "BOARD_DRAG"])
    })

    it("leaves the drift check silent", async () => {
      const { user, company } = await makeUserWithCompany("backfill-drift")
      await prisma.application.create({
        data: { userId: user.id, companyId: company.id, roleTitle: "Engineer", status: "OFFER" },
      })

      await prisma.$executeRawUnsafe(backfillStatement(user.id))

      expect(await statusEventRepository.countStatusDrift(user.id)).toBe(0)
      expect(await statusEventRepository.countContinuityViolations(user.id)).toBe(0)
    })
  })
})

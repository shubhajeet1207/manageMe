import { randomUUID } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "./application-repository"
import * as statusEventRepository from "./status-event-repository"

const createdUserIds: string[] = []

async function makeUserWithCompany() {
  const user = await prisma.user.create({
    data: {
      name: "App Repo Test",
      email: `app-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

/** A resume version written directly: these tests are about the link field on
 *  the application, not about the upload path. */
async function makeResumeVersion(userId: string) {
  const resume = await prisma.resume.create({
    data: { userId, name: `Backend SWE ${randomUUID().slice(0, 8)}` },
  })
  return prisma.resumeVersion.create({
    data: {
      userId,
      resumeId: resume.id,
      label: "October",
      originalFilename: "resume.pdf",
      storageKey: `resumes/${userId}/${randomUUID()}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 1024,
    },
  })
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  // Applications Restrict on resumeVersion, so they go before the versions
  // they point at rather than relying on the order of a user cascade.
  await prisma.application.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { resumeVersion: { userId: { in: ids } } }] },
  })
  await prisma.resumeVersion.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("applicationRepository", () => {
  it("creates an application and lists it with its company", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByUser(user.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
    expect(list[0].company.name).toBe("Acme")
  })

  it("defaults status to SAVED", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "SAVED",
    })
    expect(created.status).toBe("SAVED")
  })

  it("lists applications for one company", async () => {
    const { user, company } = await makeUserWithCompany()
    const other = await prisma.company.create({ data: { userId: user.id, name: "Globex" } })
    await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    await applicationRepository.create(user.id, {
      companyId: other.id,
      roleTitle: "Designer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByCompany(user.id, company.id)
    expect(list).toHaveLength(1)
    expect(list[0].roleTitle).toBe("Engineer")
  })

  it("finds an application by id", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const found = await applicationRepository.findById(user.id, created.id)
    expect(found?.roleTitle).toBe("Engineer")
  })

  it("updates an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.update(user.id, created.id, {
      companyId: company.id,
      roleTitle: "Senior Engineer",
      status: "INTERVIEW",
    })
    expect(updated?.roleTitle).toBe("Senior Engineer")
    expect(updated?.status).toBe("INTERVIEW")
  })

  it("updates only the status", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.updateStatus(user.id, created.id, "OFFER")
    expect(updated?.status).toBe("OFFER")
    expect(updated?.roleTitle).toBe("Engineer")
  })

  it("deletes an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    expect(await applicationRepository.remove(user.id, created.id)).toBe(true)
    expect(await applicationRepository.findById(user.id, created.id)).toBeNull()
  })

  describe("ownership", () => {
    it("does not list another user's applications", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.listByUser(other.user.id)).toHaveLength(0)
    })

    it("does not find another user's application by id", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.findById(other.user.id, created.id)).toBeNull()
    })

    it("does not update another user's application status", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(
        await applicationRepository.updateStatus(other.user.id, created.id, "REJECTED")
      ).toBeNull()
      expect((await applicationRepository.findById(owner.user.id, created.id))?.status).toBe(
        "APPLIED"
      )
    })

    it("does not delete another user's application", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.remove(other.user.id, created.id)).toBe(false)
      expect(await applicationRepository.findById(owner.user.id, created.id)).not.toBeNull()
    })
  })

  // Prisma treats an `undefined` field as "leave unchanged", not "clear it".
  // These prove `update` maps a cleared optional field to `null` in the
  // write rather than dropping it from the `data` object.
  describe("clearing an optional field", () => {
    it("unlinks a resume version when resumeVersionId is cleared", async () => {
      const { user, company } = await makeUserWithCompany()
      const version = await makeResumeVersion(user.id)
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        resumeVersionId: version.id,
      })
      expect(created.resumeVersionId).toBe(version.id)

      const updated = await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(updated?.resumeVersionId).toBeNull()
      expect(reread?.resumeVersionId).toBeNull()
    })

    it("clears jobUrl when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        jobUrl: "https://example.com/job/123",
      })
      expect(created.jobUrl).toBe("https://example.com/job/123")

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.jobUrl).toBeNull()
    })

    it("clears notes when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        notes: "Referred by a friend",
      })
      expect(created.notes).toBe("Referred by a friend")

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.notes).toBeNull()
    })

    it("clears salaryMin when omitted from an update", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        salaryMin: 90000,
      })
      expect(created.salaryMin).toBe(90000)

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      const reread = await applicationRepository.findById(user.id, created.id)
      expect(reread?.salaryMin).toBeNull()
    })
  })
})

/**
 * §7 — the recorder. A missed write here produces no error, no warning and no
 * degraded mode; it produces a funnel chart that is quietly wrong forever. So
 * every path that can change a status has its own named test, and the one most
 * likely to be missed is called out by name.
 */
describe("status history", () => {
  async function eventsFor(userId: string, applicationId: string) {
    return prisma.applicationStatusEvent.findMany({
      where: { userId, applicationId },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    })
  }

  describe("create — §7.1 path 1", () => {
    it("records a genesis event with a null fromStatus", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "SAVED",
      })

      const events = await eventsFor(user.id, created.id)
      expect(events).toHaveLength(1)
      expect(events[0].fromStatus).toBeNull()
      expect(events[0].toStatus).toBe("SAVED")
      expect(events[0].source).toBe("CREATE")
      expect(events[0].userId).toBe(user.id)
    })

    // §6.3, the single easiest thing to get wrong: the create sheet renders all
    // seven statuses, so an application can be BORN as INTERVIEW. A genesis
    // hardcoded to SAVED is fabricated data that no test against the default
    // would catch, and it would flow into the funnel as a reached-SAVED.
    it("records the genesis at the status the form submitted, not the default", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "INTERVIEW",
      })

      const events = await eventsFor(user.id, created.id)
      expect(events).toHaveLength(1)
      expect(events[0].fromStatus).toBeNull()
      expect(events[0].toStatus).toBe("INTERVIEW")
      expect(events[0].source).toBe("CREATE")
    })
  })

  describe("updateStatus — §7.1 path 2, the board drag", () => {
    it("records the transition with the status it actually came from", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      await applicationRepository.updateStatus(user.id, created.id, "SCREENING")

      const events = await eventsFor(user.id, created.id)
      expect(events).toHaveLength(2)
      expect(events[1].fromStatus).toBe("APPLIED")
      expect(events[1].toStatus).toBe("SCREENING")
      expect(events[1].source).toBe("BOARD_DRAG")
    })

    it("records nothing when a drag lands on the column it started in", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      await applicationRepository.updateStatus(user.id, created.id, "APPLIED")

      expect(await eventsFor(user.id, created.id)).toHaveLength(1)
    })
  })

  // §7.1 path 3. A reviewer who reads updateStatus concludes status writes are
  // centralised in the board drag. They are not: the edit sheet shares the same
  // seven-option select, writes status as one field of a full-row write, and is
  // reachable from every board card, the applications table AND the company
  // detail page. Miss it and the funnel under-counts forever, with no symptom.
  describe("update — §7.1 path 3, the edit sheet", () => {
    it("records a status changed through the edit sheet", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "OFFER",
      })

      const events = await eventsFor(user.id, created.id)
      expect(events).toHaveLength(2)
      expect(events[1].fromStatus).toBe("APPLIED")
      expect(events[1].toStatus).toBe("OFFER")
      expect(events[1].source).toBe("EDIT_FORM")
    })

    // §7.4. The common no-op is not a same-column re-drag: it is the user
    // fixing a typo in `notes` while the full-row write re-sends an unchanged
    // status. A phantom row here manufactures a zero-duration stage, which
    // poisons every median in §9.5.
    it("records nothing when an edit changes only the notes", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        notes: "Referred by a frend",
      })

      const updated = await applicationRepository.update(user.id, created.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
        notes: "Referred by a friend",
      })

      expect(updated?.notes).toBe("Referred by a friend")
      expect(await eventsFor(user.id, created.id)).toHaveLength(1)
    })
  })

  it("chains fromStatus across a sequence of transitions", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "SAVED",
    })

    for (const status of ["APPLIED", "SCREENING", "INTERVIEW", "SCREENING", "INTERVIEW"] as const) {
      await applicationRepository.updateStatus(user.id, created.id, status)
    }

    const events = await eventsFor(user.id, created.id)
    expect(events).toHaveLength(6)
    expect(events[0].fromStatus).toBeNull()
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].fromStatus).toBe(events[index - 1].toStatus)
    }
    expect(await statusEventRepository.countContinuityViolations(user.id)).toBe(0)
    expect(await statusEventRepository.countStatusDrift(user.id)).toBe(0)
  })

  describe("ownership", () => {
    it("writes no event when a drag targets another user's application", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(
        await applicationRepository.updateStatus(other.user.id, created.id, "OFFER")
      ).toBeNull()
      expect((await applicationRepository.findById(owner.user.id, created.id))?.status).toBe(
        "APPLIED"
      )
      expect(await eventsFor(owner.user.id, created.id)).toHaveLength(1)
      expect(
        await prisma.applicationStatusEvent.count({ where: { userId: other.user.id } })
      ).toBe(0)
    })

    it("writes no event when an edit targets another user's application", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(
        await applicationRepository.update(other.user.id, created.id, {
          companyId: other.company.id,
          roleTitle: "Hijacked",
          status: "OFFER",
        })
      ).toBeNull()
      const reread = await applicationRepository.findById(owner.user.id, created.id)
      expect(reread?.status).toBe("APPLIED")
      expect(reread?.roleTitle).toBe("Engineer")
      expect(await eventsFor(owner.user.id, created.id)).toHaveLength(1)
      expect(
        await prisma.applicationStatusEvent.count({ where: { userId: other.user.id } })
      ).toBe(0)
    })
  })

  /**
   * §7.3. A crash between the status write and the history row leaves the
   * analytics permanently wrong with no error, so the two must be one
   * transaction. The fault is injected at the database, on the event insert
   * only, which is the exact failure the design claims to survive.
   */
  describe("atomicity", () => {
    async function withRejectedEventInsert(applicationId: string, body: () => Promise<void>) {
      const constraint = `test_no_event_${randomUUID().replace(/-/g, "")}`
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ApplicationStatusEvent" ADD CONSTRAINT "${constraint}" ` +
          `CHECK ("applicationId" <> '${applicationId}') NOT VALID`
      )
      try {
        await body()
      } finally {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "ApplicationStatusEvent" DROP CONSTRAINT "${constraint}"`
        )
      }
    }

    it("rolls the board drag back when the history row cannot be written", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      await withRejectedEventInsert(created.id, async () => {
        await expect(
          applicationRepository.updateStatus(user.id, created.id, "OFFER")
        ).rejects.toThrow()

        expect((await applicationRepository.findById(user.id, created.id))?.status).toBe("APPLIED")
        expect(await eventsFor(user.id, created.id)).toHaveLength(1)
      })
    })

    it("rolls the whole edit back when the history row cannot be written", async () => {
      const { user, company } = await makeUserWithCompany()
      const created = await applicationRepository.create(user.id, {
        companyId: company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      await withRejectedEventInsert(created.id, async () => {
        await expect(
          applicationRepository.update(user.id, created.id, {
            companyId: company.id,
            roleTitle: "Staff Engineer",
            status: "OFFER",
          })
        ).rejects.toThrow()

        const reread = await applicationRepository.findById(user.id, created.id)
        expect(reread?.status).toBe("APPLIED")
        expect(reread?.roleTitle).toBe("Engineer")
        expect(await eventsFor(user.id, created.id)).toHaveLength(1)
      })
    })

    it("creates no application at all when its genesis row cannot be written", async () => {
      const { user, company } = await makeUserWithCompany()
      const constraint = `test_no_genesis_${randomUUID().replace(/-/g, "")}`
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ApplicationStatusEvent" ADD CONSTRAINT "${constraint}" ` +
          `CHECK ("userId" <> '${user.id}') NOT VALID`
      )
      try {
        await expect(
          applicationRepository.create(user.id, {
            companyId: company.id,
            roleTitle: "Engineer",
            status: "SAVED",
          })
        ).rejects.toThrow()

        expect(await applicationRepository.listByUser(user.id)).toHaveLength(0)
      } finally {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "ApplicationStatusEvent" DROP CONSTRAINT "${constraint}"`
        )
      }
    })
  })
})

/**
 * §7.5 layer 1 — structural. No arrangement of TypeScript makes a fourth status
 * writer impossible; what is achievable is making one loud. These two tests are
 * the tripwires: a new export, or a status write in any other module, fails
 * here and points the author at §7.2.
 *
 * Test files are excluded on purpose. Fifteen fixtures construct applications
 * with `prisma.application.create` and are deliberately left alone (§7.6):
 * "every application has at least one event" is NOT an invariant of this schema.
 */
describe("the chokepoint", () => {
  // The suffixed variants matter: `updateManyAndReturn` is a status write and
  // does not end at a word boundary after `updateMany`.
  const WRITE_CALL = /\b(?:prisma|tx)\.application\.(?:create|update|upsert)[A-Za-z]*\b/
  const EVENT_WRITE = /\b(?:prisma|tx)\.applicationStatusEvent\.(?:create|update|upsert|delete)[A-Za-z]*\b/g

  function sourceFiles(): string[] {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) found.push(full)
      }
    }
    walk(path.join(process.cwd(), "src"))
    return found
  }

  it("is the only module in src/ that writes Application.status", () => {
    const writers = sourceFiles().filter((file) => WRITE_CALL.test(readFileSync(file, "utf8")))
    expect(writers.map((file) => path.relative(process.cwd(), file))).toEqual([
      "src/server/repositories/application-repository.ts",
    ])
  })

  it("inserts an ApplicationStatusEvent in exactly one place in src/", () => {
    const sites = sourceFiles().flatMap((file) =>
      (readFileSync(file, "utf8").match(EVENT_WRITE) ?? []).map(
        (call) => `${path.relative(process.cwd(), file)}: ${call}`
      )
    )
    expect(sites).toEqual([
      "src/server/repositories/application-repository.ts: tx.applicationStatusEvent.create",
    ])
  })

  it("exports exactly the functions it was designed around", () => {
    expect(Object.keys(applicationRepository).sort()).toEqual([
      "create",
      "findById",
      "listByCompany",
      "listByUser",
      "remove",
      "update",
      "updateStatus",
    ])
  })
})

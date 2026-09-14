import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "@/server/repositories/application-repository"
import {
  getActivity,
  getDashboardSummary,
  getFunnel,
  getVelocity,
  MIN_SAMPLE_FOR_MEDIAN,
  publishedMedianDays,
} from "./analytics-service"
import type { StageDuration, VelocityReport } from "./analytics-service"
import type { ApplicationStatus } from "@prisma/client"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Analytics Test",
      email: `analytics-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

/** Goes through the repository, so every write records an event the way the
 *  application does — a fixture that inserted rows directly would test nothing. */
async function application(
  userId: string,
  companyId: string,
  status: ApplicationStatus,
  then: ApplicationStatus[] = []
) {
  const created = await applicationRepository.create(userId, {
    companyId,
    roleTitle: "Engineer",
    status,
  })
  for (const next of then) {
    await applicationRepository.updateStatus(userId, created.id, next)
  }
  return created
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("getDashboardSummary", () => {
  it("zero-fills every stage groupBy omits", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED")

    const summary = await getDashboardSummary(user.id)
    expect(summary.pipeline).toHaveLength(7)
    expect(summary.pipeline.map((s) => s.status)).toEqual([
      "SAVED",
      "APPLIED",
      "SCREENING",
      "INTERVIEW",
      "OFFER",
      "ACCEPTED",
      "REJECTED",
    ])
    expect(summary.pipeline.find((s) => s.status === "OFFER")?.count).toBe(0)
  })

  it("counts in-play as everything not accepted or rejected", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED")
    await application(user.id, company.id, "INTERVIEW")
    await application(user.id, company.id, "ACCEPTED")
    await application(user.id, company.id, "REJECTED")

    const summary = await getDashboardSummary(user.id)
    expect(summary.tracked).toBe(4)
    expect(summary.inPlay).toBe(2)
  })

  it("separates NOW at interview-or-better from EVER reached interview", async () => {
    const { user, company } = await makeUser()
    // Reached INTERVIEW, then rejected — the case the whole phase exists for.
    await application(user.id, company.id, "SAVED", ["INTERVIEW", "REJECTED"])

    const summary = await getDashboardSummary(user.id)
    expect(summary.nowAtInterviewOrBetter).toBe(0)
    expect(summary.everReachedInterview).toBe(1)
  })

  it("reports null rather than zero when nothing has been recorded", async () => {
    const { user } = await makeUser()
    const summary = await getDashboardSummary(user.id)
    expect(summary.everReachedInterview).toBeNull()
    expect(summary.movedThisWeek).toBeNull()
  })
})

describe("getFunnel", () => {
  it("counts an application once per stage it reached, despite a backward move", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SCREENING", ["INTERVIEW", "SCREENING", "INTERVIEW"])

    const funnel = await getFunnel(user.id)
    expect(funnel.reached.find((s) => s.status === "INTERVIEW")?.count).toBe(1)
    expect(funnel.reached.find((s) => s.status === "SCREENING")?.count).toBe(1)
  })

  it("returns a null rate rather than 0% when the denominator is zero", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED")

    const funnel = await getFunnel(user.id)
    const interviewToOffer = funnel.conversions.find((c) => c.from === "INTERVIEW")
    expect(interviewToOffer?.denominator).toBe(0)
    expect(interviewToOffer?.rate).toBeNull()
  })

  it("computes offer to accepted, the conversion the schema was split for", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "OFFER", ["ACCEPTED"])
    await application(user.id, company.id, "OFFER", ["REJECTED"])

    const funnel = await getFunnel(user.id)
    const offerToAccepted = funnel.conversions.find((c) => c.from === "OFFER")
    expect(offerToAccepted?.denominator).toBe(2)
    expect(offerToAccepted?.numerator).toBe(1)
    expect(offerToAccepted?.rate).toBe(0.5)
  })

  it("counts an application that jumped a stage, so empty rows are explained", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED", ["INTERVIEW"])

    const funnel = await getFunnel(user.id)
    expect(funnel.skippedStageCount).toBe(1)
    expect(funnel.reached.find((s) => s.status === "APPLIED")?.count).toBe(0)
  })

  it("does not count a move into rejected as skipping", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED", ["REJECTED"])

    const funnel = await getFunnel(user.id)
    expect(funnel.skippedStageCount).toBe(0)
  })

  it("keeps rejected out of the funnel stages and reports it separately", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED", ["REJECTED"])

    const funnel = await getFunnel(user.id)
    expect(funnel.reached.map((s) => s.status)).not.toContain("REJECTED")
    expect(funnel.closedRejected).toBe(1)
  })

  it("reports empty rather than a funnel of zeroes for a new user", async () => {
    const { user } = await makeUser()
    const funnel = await getFunnel(user.id)
    expect(funnel.empty).toBe(true)
  })
})

describe("ownership", () => {
  it("does not fold another user's applications into the counts", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await application(owner.user.id, owner.company.id, "INTERVIEW")

    const summary = await getDashboardSummary(other.user.id)
    expect(summary.tracked).toBe(0)
    expect(summary.nowAtInterviewOrBetter).toBe(0)
  })

  it("does not fold another user's events into the funnel", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await application(owner.user.id, owner.company.id, "SAVED", ["INTERVIEW", "OFFER"])

    const funnel = await getFunnel(other.user.id)
    expect(funnel.empty).toBe(true)
    expect(funnel.reached.every((s) => s.count === 0)).toBe(true)
  })
})

const DAY_MS = 24 * 60 * 60 * 1000
/** One instant for the whole file, so "12 days ago" means the same thing in
 *  every test regardless of how long the suite has been running. */
const START = Date.now()

/**
 * Moves an application's recorded events to the given ages, oldest first.
 *
 * `changedAt` defaults to `now()`, and a test that runs in milliseconds cannot
 * otherwise produce a ten-day interval. This rewrites WHEN the recorder's rows
 * happened, never WHAT they say — the rows themselves are still the ones
 * `application()` produced by going through the repository.
 */
async function backdateEvents(applicationId: string, daysAgo: number[]) {
  const events = await prisma.applicationStatusEvent.findMany({
    where: { applicationId, source: { not: "BACKFILL" } },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  })
  // Loud rather than silent: if the recorder ever writes a different number of
  // rows, every duration below would be computed from the wrong pairs and the
  // assertions would still pass.
  expect(events).toHaveLength(daysAgo.length)
  await Promise.all(
    events.map((event, index) =>
      prisma.applicationStatusEvent.update({
        where: { id: event.id },
        data: { changedAt: new Date(START - daysAgo[index] * DAY_MS) },
      })
    )
  )
}

/** A synthetic row of the kind the backfill migration writes. Inserted directly
 *  because nothing in the application may write one — §7.2's chokepoint has no
 *  BACKFILL path, and that is the point. */
function backfillEvent(
  userId: string,
  applicationId: string,
  toStatus: ApplicationStatus,
  daysAgo: number
) {
  return prisma.applicationStatusEvent.create({
    data: {
      userId,
      applicationId,
      fromStatus: null,
      toStatus,
      changedAt: new Date(START - daysAgo * DAY_MS),
      source: "BACKFILL",
    },
  })
}

/**
 * An application that bounced SCREENING → INTERVIEW → SCREENING …, each event
 * dated by its age in days. `daysAgo` is oldest first and its length is the
 * number of EVENTS, one more than the number of moves — the create is itself a
 * recorded event.
 *
 * The application and its genesis event go through the repository; the eight to
 * eleven transitions after it are inserted directly, in exactly the shape the
 * chokepoint writes, including the `fromStatus` chain that §7.5's drift
 * detector reads. Two reasons for the exception: what these tests assert is
 * arithmetic over a history, not who wrote the history — that is
 * `application-repository.test.ts`'s question — and eleven sequential
 * Serializable transactions against a database in Oregon, three times over,
 * added two minutes to this file for no assertion it could not make anyway.
 */
async function screeningHistory(userId: string, companyId: string, daysAgo: number[]) {
  const created = await application(userId, companyId, "SCREENING")
  await backdateEvents(created.id, [daysAgo[0]])

  const moves = daysAgo.slice(1).map((age, index) => {
    const forward = index % 2 === 0
    return {
      userId,
      applicationId: created.id,
      fromStatus: (forward ? "SCREENING" : "INTERVIEW") as ApplicationStatus,
      toStatus: (forward ? "INTERVIEW" : "SCREENING") as ApplicationStatus,
      changedAt: new Date(START - age * DAY_MS),
      source: "BOARD_DRAG" as const,
    }
  })
  await prisma.applicationStatusEvent.createMany({ data: moves })
  // The live row has to agree with the last event, or getVelocity counts this
  // application as unmeasurable rather than ageing it (§7.5) — which is a real
  // behaviour, tested below, and would silently gut these fixtures.
  await prisma.application.update({
    where: { id: created.id },
    data: { status: moves[moves.length - 1].toStatus },
  })
  return created
}

/** Throws rather than returning undefined: every stage is zero-filled, so a
 *  missing row is a bug in the service and `?.` would hide it behind a passing
 *  assertion on `undefined`. */
function stageOf(report: VelocityReport, status: ApplicationStatus): StageDuration {
  const stage = report.stages.find((s) => s.status === status)
  if (!stage) throw new Error(`no stage row for ${status}`)
  return stage
}

describe("getVelocity", () => {
  it("excludes BACKFILL rows from every duration", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SCREENING", ["INTERVIEW"])
    await backdateEvents(created.id, [30, 20])
    // Dated between the two real events and claiming a stage the application
    // never recorded. If it leaked in, SCREENING would read 5 days instead of
    // 10 and APPLIED would invent a 5-day interval out of nothing.
    await backfillEvent(user.id, created.id, "APPLIED", 25)

    const velocity = await getVelocity(user.id)
    expect(stageOf(velocity, "SCREENING").durationsDays).toEqual([10])
    expect(stageOf(velocity, "APPLIED").n).toBe(0)
    expect(stageOf(velocity, "APPLIED").medianDays).toBeNull()
  })

  it("takes the middle value when the interval count is odd", async () => {
    const { user, company } = await makeUser()
    // SCREENING intervals of 1, 2, 3, 4 and 100 days. The mean is 22 and the
    // median is 3 — the four-month holiday §9.5 names, in one fixture.
    await screeningHistory(user.id, company.id, [120, 119, 118, 116, 115, 112, 111, 107, 102, 2, 1])

    const velocity = await getVelocity(user.id)
    const screening = stageOf(velocity, "SCREENING")
    expect(screening.durationsDays).toEqual([1, 2, 3, 4, 100])
    expect(screening.n).toBe(5)
    expect(screening.medianDays).toBe(3)
    expect(publishedMedianDays(screening)).toBe(3)
  })

  it("averages the two middle values when the interval count is even", async () => {
    const { user, company } = await makeUser()
    // SCREENING intervals of 1, 2, 3, 4, 5 and 60 days: the median is 3.5, so
    // neither middle value on its own is the right answer.
    await screeningHistory(
      user.id,
      company.id,
      [85, 84, 83, 81, 80, 77, 76, 72, 71, 66, 65, 5]
    )

    const velocity = await getVelocity(user.id)
    const screening = stageOf(velocity, "SCREENING")
    expect(screening.durationsDays).toEqual([1, 2, 3, 4, 5, 60])
    expect(screening.n).toBe(6)
    expect(screening.medianDays).toBe(3.5)
  })

  it("computes a median of one but refuses to publish it", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SCREENING", ["INTERVIEW"])
    await backdateEvents(created.id, [40, 30])

    const velocity = await getVelocity(user.id)
    const screening = stageOf(velocity, "SCREENING")
    expect(screening.n).toBe(1)
    expect(screening.durationsDays).toEqual([10])
    expect(screening.medianDays).toBe(10)
    // The n is what the page renders in its place, so the raw durations must
    // survive even when the statistic is withheld.
    expect(publishedMedianDays(screening)).toBeNull()
    expect(MIN_SAMPLE_FOR_MEDIAN).toBeGreaterThan(1)
  })

  it("reports no interval for an application still in its first stage", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SAVED")
    await backdateEvents(created.id, [12])

    const velocity = await getVelocity(user.id)
    // The one event opens an interval that is still running. Counting it would
    // make SAVED look like a stage applications pass through in no time.
    expect(velocity.stages.every((stage) => stage.n === 0)).toBe(true)
    expect(stageOf(velocity, "SAVED").medianDays).toBeNull()

    expect(velocity.oldest).toHaveLength(1)
    const age = velocity.oldest[0]
    expect(age.applicationId).toBe(created.id)
    expect(age.status).toBe("SAVED")
    expect(age.days).toBeCloseTo(12, 1)
    // Nothing to compare it to, so nothing is claimed about it.
    expect(age.stageMedianDays).toBeNull()
    expect(age.stalled).toBe(false)
    expect(velocity.stalledCount).toBe(0)
  })

  it("flags an open application only against the user's own published median", async () => {
    const { user, company } = await makeUser()
    // Five closed SCREENING intervals of 1, 2, 3, 4 and 100 days: median 3. Its
    // own open interval is one day old, so this application is deliberately NOT
    // stalled — the count below would otherwise pass for the wrong reason.
    await screeningHistory(user.id, company.id, [120, 119, 118, 116, 115, 112, 111, 107, 102, 2, 1])
    // A second application, sitting in SCREENING for 20 days — well past 3.
    const stale = await application(user.id, company.id, "SCREENING")
    await backdateEvents(stale.id, [20])

    const velocity = await getVelocity(user.id)
    const age = velocity.oldest.find((row) => row.applicationId === stale.id)
    expect(age?.stageMedianDays).toBe(3)
    expect(age?.stalled).toBe(true)
    expect(velocity.stalledCount).toBe(1)
  })

  it("leaves out an open application whose current stage was never recorded", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SAVED")
    // §7.5's fourth path, simulated: a status written without an event. The
    // latest recorded event now says SAVED while the row says INTERVIEW, so any
    // age would be measured from the wrong instant.
    await prisma.application.update({
      where: { id: created.id },
      data: { status: "INTERVIEW" },
    })

    const velocity = await getVelocity(user.id)
    expect(velocity.oldest).toHaveLength(0)
    expect(velocity.unmeasurableOpen).toBe(1)
  })
})

describe("getActivity", () => {
  it("merges status changes, completed tasks and filed documents, newest first", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SAVED", ["INTERVIEW"])
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title: "Send follow-up to Acme",
        status: "DONE",
        completedAt: new Date(START - 2 * DAY_MS),
      },
    })
    const document = await prisma.document.create({
      data: {
        userId: user.id,
        title: "Acme offer letter",
        originalFilename: "offer.pdf",
        storageKey: `test/${created.id}/offer.pdf`,
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
    })

    const { entries } = await getActivity(user.id)
    const sources = entries.map((entry) => entry.source)
    expect(sources).toContain("STATUS_CHANGE")
    expect(sources).toContain("APPLICATION_ADDED")
    expect(sources).toContain("TASK_COMPLETED")
    expect(sources).toContain("DOCUMENT_FILED")

    const times = entries.map((entry) => entry.at.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
    // The only entry dated two days ago, so it is the ordering assertion with
    // teeth: everything else was written by this test just now.
    expect(entries[entries.length - 1].source).toBe("TASK_COMPLETED")

    const taskEntry = entries.find((entry) => entry.source === "TASK_COMPLETED")
    expect(taskEntry?.id).toBe(task.id)
    expect(taskEntry?.verb).toBe("Completed")
    expect(taskEntry?.metricClass).toBe("recorded")
    expect(taskEntry?.subject).toBe("Send follow-up to Acme")

    const documentEntry = entries.find((entry) => entry.source === "DOCUMENT_FILED")
    expect(documentEntry?.href).toBe(`/documents/${document.id}`)
    // A filing date is exact for the row and silent about the world: the
    // document was issued before it was filed, and this figure cannot say when.
    expect(documentEntry?.metricClass).toBe("current-state")

    const move = entries.find((entry) => entry.source === "STATUS_CHANGE")
    expect(move?.verb).toBe("Moved")
    expect(move?.metricClass).toBe("recorded")
    expect(move?.subject).toBe("Acme — Engineer")

    // Every key is unique, which is what the feed de-duplicates on across a
    // page boundary — and what React keys on.
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length)
  })

  it("marks a backfilled entry approximate and never as a move", async () => {
    const { user, company } = await makeUser()
    const created = await application(user.id, company.id, "SAVED")
    await backfillEvent(user.id, created.id, "INTERVIEW", 3)

    const { entries } = await getActivity(user.id)
    const backfilled = entries.filter((entry) => entry.source === "STATUS_BACKFILL")
    expect(backfilled).toHaveLength(1)
    expect(backfilled[0].metricClass).toBe("approximate")
    expect(backfilled[0].status).toBe("INTERVIEW")
    // A synthetic row must never read as a transition: its date is the
    // application's last edit, not when the status changed (§8.4c).
    expect(backfilled[0].verb).toBeNull()

    const recorded = entries.filter((entry) => entry.source === "STATUS_CHANGE")
    expect(recorded).toHaveLength(1)
    expect(recorded[0].metricClass).toBe("recorded")
  })

  it("stops at the page size and only offers a cursor when more remain", async () => {
    const { user, company } = await makeUser()
    await application(user.id, company.id, "SAVED", ["APPLIED", "SCREENING"])

    // Four entries exist: the application, and three status events.
    const full = await getActivity(user.id, { pageSize: 4 })
    expect(full.entries).toHaveLength(4)
    expect(full.nextCursor).toBeNull()

    const first = await getActivity(user.id, { pageSize: 2 })
    expect(first.entries).toHaveLength(2)
    expect(first.nextCursor).toEqual(first.entries[1].at)
  })
})

describe("ownership, on the duration and activity surfaces", () => {
  it("does not fold another user's intervals into a median", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await application(owner.user.id, owner.company.id, "SCREENING", [
      "INTERVIEW",
    ])
    await backdateEvents(created.id, [30, 20])

    const velocity = await getVelocity(other.user.id)
    expect(velocity.stages.every((stage) => stage.n === 0)).toBe(true)
    expect(velocity.oldest).toHaveLength(0)
    expect(velocity.empty).toBe(true)
  })

  it("does not fold another user's activity into the feed", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await application(owner.user.id, owner.company.id, "SAVED", ["INTERVIEW"])
    await prisma.task.create({
      data: {
        userId: owner.user.id,
        title: "Owner's task",
        status: "DONE",
        completedAt: new Date(START - DAY_MS),
      },
    })
    await prisma.document.create({
      data: {
        userId: owner.user.id,
        title: "Owner's offer letter",
        originalFilename: "offer.pdf",
        storageKey: `test/${owner.user.id}/offer.pdf`,
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
    })

    const { entries } = await getActivity(other.user.id)
    expect(entries).toHaveLength(0)
  })
})

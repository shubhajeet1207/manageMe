import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "@/server/repositories/application-repository"
import { getDashboardSummary, getFunnel } from "./analytics-service"
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

import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"
import { checkQuota, effectivePlan, planLimits, type QuotaResource } from "./plans"

export { QuotaExceededError } from "./plans"

export async function lockAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
}

async function usage(tx: Prisma.TransactionClient, userId: string, resource: QuotaResource) {
  if (resource === "applications") return tx.application.count({ where: { userId } })
  if (resource === "contacts") return tx.contact.count({ where: { userId } })
  if (resource === "reminders") return tx.reminder.count({ where: { userId, state: "PENDING" } })
  const [documents, resumes, reserved] = await Promise.all([
    tx.document.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
    tx.resumeVersion.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
    tx.uploadIntent.aggregate({ where: { userId, completedAt: null, expiresAt: { gt: new Date() } }, _sum: { sizeBytes: true } }),
  ])
  return (documents._sum.sizeBytes ?? 0) + (resumes._sum.sizeBytes ?? 0) + (reserved._sum.sizeBytes ?? 0)
}

/** Caller must hold lockAccount and perform the write on the SAME transaction. */
export async function assertQuota(tx: Prisma.TransactionClient, userId: string, resource: QuotaResource, increment: number) {
  const account = await tx.billingAccount.findUnique({ where: { userId } })
  const limit = planLimits(effectivePlan(account))[resource]
  checkQuota(resource, await usage(tx, userId, resource), increment, limit)
}

/** Every creation path (including bulk import and direct-upload reservations) shares this lock. */
export async function withQuota<T>(userId: string, resource: QuotaResource, increment: number, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockAccount(tx, userId)
    await assertQuota(tx, userId, resource, increment)
    return work(tx)
  }, { timeout: 15_000 })
}

export async function getEntitlements(userId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.billingAccount.findUnique({ where: { userId } })
    const plan = effectivePlan(account)
    const resources = ["applications", "contacts", "reminders", "storageBytes"] as const
    const used = Object.fromEntries(await Promise.all(resources.map(async (resource) => [resource, await usage(tx, userId, resource)]))) as Record<QuotaResource, number>
    return { plan, limits: planLimits(plan), used, billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID), hasCustomer: Boolean(account?.customerId), cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false, currentPeriodEnd: account?.currentPeriodEnd ?? null }
  })
}

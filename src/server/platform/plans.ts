export type PlanName = "FREE" | "PRO"
export type QuotaResource = "applications" | "contacts" | "reminders" | "storageBytes"

const defaults: Record<PlanName, Record<QuotaResource, number>> = {
  FREE: { applications: 50, contacts: 25, reminders: 20, storageBytes: 104_857_600 },
  PRO: { applications: 5_000, contacts: 5_000, reminders: 5_000, storageBytes: 5_368_709_120 },
}
const names: Record<QuotaResource, string> = {
  applications: "APPLICATIONS", contacts: "CONTACTS", reminders: "REMINDERS", storageBytes: "STORAGE_BYTES",
}

export function planLimits(
  plan: PlanName,
  env: Record<string, string | undefined> = process.env
) {
  return Object.fromEntries(Object.entries(defaults[plan]).map(([resource, fallback]) => {
    const raw = env[`${plan}_${names[resource as QuotaResource]}`]
    const value = raw === undefined || raw === "" ? fallback : Number(raw)
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${plan} quota configuration`)
    return [resource, value]
  })) as Record<QuotaResource, number>
}

export function effectivePlan(account: { plan: PlanName; status: string; currentPeriodEnd: Date | null } | null, now = new Date()): PlanName {
  return account?.plan === "PRO" && ["active", "trialing"].includes(account.status)
    && account.currentPeriodEnd !== null && account.currentPeriodEnd > now ? "PRO" : "FREE"
}

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED"
  constructor(readonly resource: QuotaResource, readonly limit: number) {
    super(`Your plan's ${resource === "storageBytes" ? "storage" : resource} limit has been reached. Review your plan to add more.`)
    this.name = "QuotaExceededError"
  }
}

export function checkQuota(resource: QuotaResource, used: number, increment: number, limit: number) {
  if (!Number.isSafeInteger(increment) || increment < 0) throw new Error("Quota increment must be a non-negative integer")
  if (used + increment > limit) throw new QuotaExceededError(resource, limit)
}

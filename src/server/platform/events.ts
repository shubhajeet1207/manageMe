import { z } from "zod"
import { prisma } from "@/lib/db/prisma"

// No URLs, company names, job titles, document names, emails, or arbitrary text.
// Object schemas are strict: callers cannot accidentally expand the data collected.
const empty = z.object({}).strict()
export const eventSchemas = {
  signup_completed: empty,
  onboarding_completed: empty,
  session_started: empty,
  application_created: z.object({ source: z.enum(["manual", "csv", "browser"]).optional() }).strict(),
  application_status_changed: z.object({ status: z.enum(["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]) }).strict(),
  resume_uploaded: empty,
  document_uploaded: empty,
  task_completed: empty,
  contact_created: empty,
  interview_created: empty,
  reminder_created: empty,
  reminder_completed: empty,
  csv_import_completed: z.object({ count: z.number().int().min(1).max(500) }).strict(),
  feature_used: z.object({ feature: z.enum(["dashboard", "applications", "companies", "resumes", "documents", "projects", "tasks", "links", "quick-drop", "credentials", "analytics", "agenda", "settings"]) }).strict(),
  upgrade_viewed: empty,
  checkout_started: empty,
  subscription_activated: empty,
} as const
export type ProductEventName = keyof typeof eventSchemas
export type EventProperties<N extends ProductEventName> = z.input<(typeof eventSchemas)[N]>

export function sanitizeEvent<N extends ProductEventName>(name: N, properties: unknown = {}) {
  const schema = eventSchemas[name]
  if (!schema) throw new Error("Unknown product event")
  return schema.parse(properties)
}

/** Best effort telemetry: a recording outage must never fail the user's successful action. */
export async function trackEvent<N extends ProductEventName>(userId: string, name: N, properties: EventProperties<N> = {} as EventProperties<N>, dedupeKey?: string) {
  const safe = sanitizeEvent(name, properties)
  try {
    const preference = await prisma.userPreference.findUnique({ where: { userId }, select: { analyticsEnabled: true } })
    if (!preference?.analyticsEnabled) return
    await prisma.productEvent.createMany({ data: [{ userId, name, properties: safe, dedupeKey: dedupeKey ? `${userId}:${name}:${dedupeKey}` : null }], skipDuplicates: true })
  } catch {
    console.warn(JSON.stringify({ level: "warn", event: "product_event_recording_failed", name }))
  }
}

export function eventRetentionDays() {
  const raw = process.env.PRODUCT_EVENT_RETENTION_DAYS
  const value = raw === undefined || raw.trim() === "" ? 90 : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 365) throw new Error("PRODUCT_EVENT_RETENTION_DAYS must be between 1 and 365")
  return value
}

/** Run from the protected maintenance job, not from request rendering. */
export async function purgeExpiredEvents(now = new Date()) {
  return prisma.productEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - eventRetentionDays() * 86_400_000) } } })
}

export async function updatePreferences(userId: string, input: { analyticsEnabled: boolean; lifecycleEmailEnabled: boolean; reminderEmailEnabled: boolean }) {
  const data = z.object({ analyticsEnabled: z.boolean(), lifecycleEmailEnabled: z.boolean(), reminderEmailEnabled: z.boolean() }).strict().parse(input)
  return prisma.$transaction(async (tx) => {
    const preference = await tx.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data })
    if (!data.analyticsEnabled) await tx.productEvent.deleteMany({ where: { userId } })
    return preference
  })
}

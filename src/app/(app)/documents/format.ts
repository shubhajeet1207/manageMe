/** The vault formats a date and a file size exactly as the resume library does,
 *  so the two tables cannot drift into two conventions. */
export { formatDate, formatFileSize } from "../resumes/format"

/** How far ahead an expiry starts being worth saying out loud. A judgement,
 *  stated in one place: far enough to renew a passport, near enough that a
 *  2035 expiry is not permanently shouting. */
export const EXPIRY_WARNING_DAYS = 30

export type ExpiryState = { tone: "expired" | "warning"; label: string }

/** Whole days between two instants, counted on UTC day boundaries rather than
 *  in milliseconds: a date input submits midnight UTC, and an expiry is a day
 *  rather than a moment, so 23:59 on the due date is still "today". */
function daysUntil(expiresOn: Date, now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const end = Date.UTC(
    expiresOn.getUTCFullYear(),
    expiresOn.getUTCMonth(),
    expiresOn.getUTCDate()
  )
  return Math.round((end - start) / 86_400_000)
}

/**
 * The badge beside a title, computed at render time from the row and nothing
 * else. There are no reminders and no stored state — which is exactly why a
 * date beats a tag like `expires-2027`: the state maintains itself.
 */
export function expiryState(expiresOn: Date | null, now: Date = new Date()): ExpiryState | null {
  if (!expiresOn) return null

  const days = daysUntil(expiresOn, now)
  if (days < 0) return { tone: "expired", label: "Expired" }
  if (days === 0) return { tone: "warning", label: "Expires today" }
  if (days === 1) return { tone: "warning", label: "Expires tomorrow" }
  if (days <= EXPIRY_WARNING_DAYS) return { tone: "warning", label: `Expires in ${days} days` }
  return null
}

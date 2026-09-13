/**
 * A due date is a calendar DAY stored as a Postgres DATE, which Prisma reads
 * back as a JS Date at UTC midnight. Every function here therefore reads it
 * with UTC getters and formats it by hand.
 *
 * `toLocaleDateString()` on a UTC-midnight Date prints the PREVIOUS day for
 * every reader west of Greenwich, which is the bug this module exists to not
 * have. `Intl` with `timeZone: "UTC"` would also work; the hand-built string is
 * one line shorter and cannot be reconfigured by a locale.
 *
 * "Today", by contrast, is the READER'S today — so `localCalendarDate` is the
 * one function here that reads local getters, and it is what the client passes
 * into `bucketFor` after mount.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const DAY_MS = 24 * 60 * 60 * 1000

export type DueBucket = "OVERDUE" | "TODAY" | "WEEK" | "LATER" | "NONE"

/** Already exactly the order an ascending due-date sort with nulls last puts
 *  the rows in, which is why the client can insert headers without moving a
 *  single row (§7.5). */
export const DUE_BUCKET_ORDER: DueBucket[] = ["OVERDUE", "TODAY", "WEEK", "LATER", "NONE"]

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  OVERDUE: "Overdue",
  TODAY: "Due today",
  WEEK: "This week",
  LATER: "Later",
  NONE: "No due date",
}

/** What `<input type="date">` reads and writes. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return ""
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${date.getUTCFullYear()}-${month}-${day}`
}

export function formatDueDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** The reader's own calendar day, expressed the way a stored due date is: UTC
 *  midnight. Local getters here are correct and deliberate. */
export function localCalendarDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/** The same day as a `YYYY-MM-DD` string. A stable, comparable snapshot value,
 *  which is what `useSyncExternalStore` needs: a fresh `Date` on every read
 *  would never compare equal and would re-render forever. */
export function localCalendarDateKey(now: Date = new Date()): string {
  return toDateInputValue(localCalendarDate(now))
}

export function bucketFor(dueDate: Date | null, today: Date): DueBucket {
  if (!dueDate) return "NONE"

  const days = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS)
  if (days < 0) return "OVERDUE"
  if (days === 0) return "TODAY"
  if (days <= 6) return "WEEK"
  return "LATER"
}

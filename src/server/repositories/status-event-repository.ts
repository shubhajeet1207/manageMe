import { prisma } from "@/lib/db/prisma"
import type { ApplicationStatusEvent } from "@prisma/client"

/**
 * Reads over the status-transition log — and ONLY reads.
 *
 * There is deliberately no create, no update and no delete here. Append-only is
 * not a comment somewhere promising good behaviour; it is the absence of any
 * code in this module that can write an event. The single INSERT lives in
 * `application-repository.ts`'s `commitStatusWrite`, inside the transaction
 * that writes the status it describes (§7.2).
 *
 * Every function takes `userId` first and puts it in a TOP-LEVEL `where` —
 * never `where: { application: { userId } }`. A dropped relation filter on a
 * `findFirst` returns a visible wrong row; a dropped relation filter on an
 * aggregate returns a wrong number, rendered beautifully, with no error (§5.1).
 */

/** One application's history, oldest first — the order every duration and
 *  continuity calculation depends on. `(changedAt, id)` because two events can
 *  share a millisecond and a partial order makes paging non-deterministic. */
export function listByApplication(
  userId: string,
  applicationId: string
): Promise<ApplicationStatusEvent[]> {
  return prisma.applicationStatusEvent.findMany({
    where: { userId, applicationId },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
  })
}

/**
 * Applications whose live `status` disagrees with their latest recorded
 * `toStatus` — §7.5 layer 3.
 *
 * No arrangement of TypeScript makes a fourth status writer impossible. This is
 * what makes one loud: if something wrote a status without recording it, this
 * count goes non-zero and `/analytics` renders a non-dismissible warning band
 * above every chart saying the figures are under-counting.
 *
 * It deliberately does NOT fire on an application with zero events: no events
 * means "not recorded", not "recorded wrongly", and conflating them would make
 * the band fire on every test database (§7.6). BACKFILL rows count — a
 * backfilled row is the latest event and must still match the live status.
 *
 * Raw because the comparison is between two tables' columns per row, which
 * Prisma's query API cannot express; `userId` is a bound parameter, not
 * interpolated text.
 */
export async function countStatusDrift(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "Application" a
    JOIN LATERAL (
      SELECT e."toStatus"
      FROM "ApplicationStatusEvent" e
      WHERE e."userId" = a."userId" AND e."applicationId" = a."id"
      ORDER BY e."changedAt" DESC, e."id" DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE a."userId" = ${userId} AND latest."toStatus" <> a."status"
  `
  return rows[0]?.count ?? 0
}

/**
 * Events that contradict their own predecessor — §7.5 layer 2, and the single
 * reason `fromStatus` is stored rather than derived from the previous row
 * (§6.2).
 *
 * The invariant: ordered by `(changedAt, id)` within an application, exactly
 * the first event has `fromStatus IS NULL`, and every later event's
 * `fromStatus` equals its predecessor's `toStatus`.
 *
 * Because the chokepoint always reads its before-image from the LIVE row, a
 * bypassed write does not leave a gap — a gap is indistinguishable from a
 * legitimate multi-stage drag — it leaves a contradiction in the NEXT
 * legitimate transition. Vacuously zero for an application with no events,
 * which is correct.
 */
export async function countContinuityViolations(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT
        e."fromStatus" AS "fromStatus",
        LAG(e."toStatus") OVER w AS "previousTo",
        ROW_NUMBER() OVER w AS "position"
      FROM "ApplicationStatusEvent" e
      WHERE e."userId" = ${userId}
      WINDOW w AS (PARTITION BY e."applicationId" ORDER BY e."changedAt", e."id")
    ) ordered
    WHERE ("position" = 1 AND "fromStatus" IS NOT NULL)
       OR ("position" > 1 AND ("fromStatus" IS NULL OR "fromStatus" <> "previousTo"))
  `
  return rows[0]?.count ?? 0
}

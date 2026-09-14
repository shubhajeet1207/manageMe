import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import type {
  Application,
  ApplicationStatus,
  Company,
  StatusEventSource,
} from "@prisma/client"
import {
  resolveApplicationSort,
  type ApplicationSort,
  type ApplicationSortInput,
  type SortDirection,
} from "@/lib/application-sort"
import { STATUS_ORDER } from "@/lib/status-order"
import type { CreateApplicationInput } from "@/server/validators/application-schemas"

export type ApplicationWithCompany = Application & { company: Company }

type StatusWrite<T> = {
  userId: string
  /** Null on create: there is no before-image to read. */
  existingId: string | null
  source: StatusEventSource
  write: (tx: Prisma.TransactionClient) => Promise<T | null>
}

/**
 * Postgres raises 40001 on a serialization failure. Prisma maps it to P2034
 * when the failure surfaces through the query engine, but `@prisma/adapter-pg`
 * raises its own `DriverAdapterError` with `cause.kind` when the failure
 * happens on the transaction's own statements — both shapes reach here and
 * both mean the same thing.
 */
function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2034"
  if (!(error instanceof Error) || error.name !== "DriverAdapterError") return false
  return (error.cause as { kind?: unknown } | undefined)?.kind === "TransactionWriteConflict"
}

/**
 * Postgres's own guidance for Serializable is that the application must be
 * prepared to retry. The design spec (§7.3) budgets one retry. This budgets
 * nine, because measurement showed the smaller budget was not a safety margin
 * but a coin flip: at one retry the suite failed 3-7 tests per run, in a
 * different set each time, all of them `TransactionWriteConflict`; at five it
 * still failed one.
 *
 * Why conflicts are common here despite every write targeting ONE row by
 * primary key: SSI takes predicate locks at PAGE granularity, and `Application`
 * and `ApplicationStatusEvent` are small enough that every row shares a heap
 * page. A page lock on a one-page table is a table lock, so two writes to
 * unrelated rows — even two different users' rows — serialize against each
 * other. `enable_seqscan = off` below narrows a sequential scan to an index
 * scan, but it cannot subdivide a page. This is the documented false-positive
 * case for SSI on small tables, and the prescribed answer is to retry, not to
 * tune the query away.
 *
 * Retrying is always safe: a serialization failure aborts the transaction
 * whole, so there is never a partial write to reconcile.
 */
const SERIALIZATION_ATTEMPTS = 10

/**
 * Full jitter — a random draw from the whole interval, not a fixed delay with
 * noise added. This matters more than the attempt count: a fixed backoff
 * re-synchronizes the very transactions that just collided, because they sleep
 * the same duration and wake together to collide again. Drawing from
 * [0, window) scatters them instead.
 *
 * Base and cap are sized for a remote database, where one attempt costs
 * several round trips rather than a few milliseconds.
 */
const BACKOFF_BASE_MS = 50
const BACKOFF_CAP_MS = 1_000

function backoffFor(failures: number): number {
  const window = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (failures - 1))
  return Math.random() * window
}

/**
 * THE CHOKEPOINT (§7.2). The only place in the codebase that writes
 * `Application.status` or inserts an `ApplicationStatusEvent`.
 *
 * It is a WRAPPER, not a helper. `create`, `update` and `updateStatus` hand it
 * a `write` callback and never touch `prisma.application` themselves, so they
 * cannot perform their own write without going through it. A helper you must
 * remember to call is precisely the bypassable thing.
 *
 * It (1) reads the before-image from the LIVE row inside the transaction,
 * (2) runs the callback, (3) inserts the event only when the status actually
 * moved, and (4) returns null when the row is not the caller's — leaving
 * "missing" and "not yours" indistinguishable, as every other repository here
 * does.
 *
 * `toStatus` comes from the row the callback wrote, never from what the caller
 * said it would write: the genesis of an application created directly as
 * INTERVIEW is INTERVIEW, and a hardcoded SAVED there would be fabricated data
 * that no test against the default would catch (§6.3).
 *
 * Atomicity: one interactive transaction, both writes on the same `tx`. There
 * is no arrangement in which a status moves without a row, or a row exists for
 * a status that did not move.
 *
 * Isolation is Serializable explicitly, because the before-image read and the
 * write are two statements: under Read Committed two concurrent drags can both
 * read SCREENING and both write an event claiming an origin one of them never
 * had. On a serialization failure Postgres raises 40001 and this retries
 * before letting the service map it to the existing generic error — no new
 * error class, because an exhausted retry is not a distinct user-facing
 * condition. Compare-and-set was rejected (§7.3): it makes an
 * edit-sheet save fail when a drag lands mid-edit, and it collapses "not
 * yours" / "not found" / "status moved" into one indistinguishable count.
 */
async function commitStatusWrite<T extends { id: string; status: ApplicationStatus }>({
  userId,
  existingId,
  source,
  write,
}: StatusWrite<T>): Promise<T | null> {
  const attempt = () =>
    prisma.$transaction(
      async (tx) => {
        let previous: ApplicationStatus | null = null

        if (existingId !== null) {
          // PostgreSQL takes a RELATION-level predicate lock for a sequential
          // scan, so under Serializable this read would conflict with every
          // concurrent write to Application, not just one to the same row. The
          // planner picks a sequential scan because the table is small, which
          // it stays for a single user:
          //
          //   EXPLAIN SELECT "status" FROM "Application"
          //           WHERE "id" = $1 AND "userId" = $2
          //   -> Seq Scan on "Application"
          //
          // Forcing the index scan narrows the lock to the rows this write
          // actually touches. It is the granularity measure PostgreSQL's own
          // SSI documentation prescribes, and SET LOCAL scopes it to this
          // transaction. Skipped on create, which has no before-image to read
          // and so takes no predicate lock worth narrowing — one fewer round
          // trip on the path every other test fixture in this repo exercises.
          await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off")

          previous =
            (
              await tx.application.findFirst({
                where: { id: existingId, userId },
                select: { status: true },
              })
            )?.status ?? null

          if (previous === null) return null
        }

        const row = await write(tx)
        if (row === null) return null

        if (previous !== row.status) {
          await tx.applicationStatusEvent.create({
            data: {
              userId,
              applicationId: row.id,
              fromStatus: previous,
              toStatus: row.status,
              source,
            },
          })
        }

        return row
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )

  let remaining = SERIALIZATION_ATTEMPTS
  while (true) {
    remaining -= 1
    try {
      return await attempt()
    } catch (error) {
      if (remaining === 0 || !isSerializationFailure(error)) throw error
      const failures = SERIALIZATION_ATTEMPTS - remaining
      await new Promise((resolve) => setTimeout(resolve, backoffFor(failures)))
    }
  }
}

/**
 * What the list functions ordered by before sorting was a parameter, and what
 * they still order by when no sort is passed.
 *
 * `id` is appended as a final tiebreak on every sort: `updatedAt` has
 * millisecond resolution and a seeded fixture writes several rows inside one
 * millisecond, so without it two reloads of the same URL can return the same
 * rows in a different order — a table that reshuffles under the cursor, and a
 * test that passes on Tuesday.
 */
const DEFAULT_ORDER_BY: Prisma.ApplicationOrderByWithRelationInput[] = [
  { updatedAt: "desc" },
  { id: "asc" },
]

/**
 * A `switch`, not a lookup table, so the compiler proves every allowlisted key
 * has a clause; and the key reaching here has already been through
 * `resolveApplicationSort`, so the user's string was compared against the
 * allowlist before it ever helped build a query. Neither layer alone is
 * enough: the allowlist is what keeps `?sort=toString` out, and the switch is
 * what keeps a future key from silently falling through to the default.
 */
function orderByFor({
  key,
  direction,
}: ApplicationSort): Prisma.ApplicationOrderByWithRelationInput[] {
  switch (key) {
    case "role":
      return [{ roleTitle: direction }, ...DEFAULT_ORDER_BY]
    case "company":
      return [{ company: { name: direction } }, ...DEFAULT_ORDER_BY]
    case "applied":
      // `nulls: "last"` in BOTH directions. An application with no applied date
      // has not been applied to; it is not the oldest one. Postgres defaults
      // put NULLs first on DESC, which would open the "most recently applied"
      // view on the rows that were never applied to at all.
      return [{ appliedAt: { sort: direction, nulls: "last" } }, ...DEFAULT_ORDER_BY]
    case "status":
      // Sorted after the fact — see `sortByPipelineOrder`. The rows still come
      // back in the default order so that pipeline ties have a stable
      // tiebreak, which is the whole reason the reorder below can be stable.
      return DEFAULT_ORDER_BY
    case "updated":
      return direction === "desc" ? DEFAULT_ORDER_BY : [{ updatedAt: "asc" }, { id: "asc" }]
  }
}

/** A status missing from `STATUS_ORDER` sorts as if it sat one past the last
 *  stage, rather than one before the first — which is where a raw `indexOf` of
 *  -1 would put a status added to the enum but not to the array. */
function pipelineRank(status: ApplicationStatus): number {
  const index = STATUS_ORDER.indexOf(status)
  return index === -1 ? STATUS_ORDER.length : index
}

/**
 * Status is the one column the database cannot order for us.
 *
 * It looks like it can: Postgres sorts an enum by each value's declared
 * position in the type, and today that declaration happens to match
 * `STATUS_ORDER`. But `ALTER TYPE ... ADD VALUE` appends, so the first status
 * added mid-funnel would sort last in the database while `STATUS_ORDER` puts
 * it in the middle — and the table would quietly disagree with the board, the
 * badges and §9.3's skip detection, all of which read the array. The array is
 * the source of truth, so the rank comes from the array.
 *
 * Doing it in memory is safe because these lists are unpaginated by
 * construction: both callers already read the user's entire set of
 * applications to render a board or a table.
 *
 * `Array.prototype.sort` is required to be stable, so rows sharing a status
 * keep the ORDER BY's `updatedAt desc, id asc`.
 */
function sortByPipelineOrder(
  rows: ApplicationWithCompany[],
  direction: SortDirection
): ApplicationWithCompany[] {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => sign * (pipelineRank(a.status) - pipelineRank(b.status)))
}

/**
 * The one place the list queries are actually built.
 *
 * `userId` is spread LAST into the `where` so no scope a caller passes can
 * overwrite it — the ownership filter is not something a future caller gets to
 * opt out of by accident.
 */
async function listSorted(
  userId: string,
  scope: Prisma.ApplicationWhereInput,
  sortInput: ApplicationSortInput | undefined
): Promise<ApplicationWithCompany[]> {
  const sort = resolveApplicationSort(sortInput)
  const rows = await prisma.application.findMany({
    where: { ...scope, userId },
    include: { company: true },
    orderBy: orderByFor(sort),
  })
  // The reorder runs on rows the query already scoped to `userId`, so it can
  // move rows around but cannot introduce one.
  return sort.key === "status" ? sortByPipelineOrder(rows, sort.direction) : rows
}

export function listByUser(
  userId: string,
  sort?: ApplicationSortInput
): Promise<ApplicationWithCompany[]> {
  return listSorted(userId, {}, sort)
}

export function listByCompany(
  userId: string,
  companyId: string,
  sort?: ApplicationSortInput
): Promise<ApplicationWithCompany[]> {
  return listSorted(userId, { companyId }, sort)
}

export function findById(userId: string, id: string): Promise<ApplicationWithCompany | null> {
  return prisma.application.findFirst({ where: { id, userId }, include: { company: true } })
}

/** §7.1 path 1. The create sheet renders all seven statuses, so an application
 *  can be BORN as INTERVIEW — this is a status write, not just an insert. */
export async function create(
  userId: string,
  data: CreateApplicationInput
): Promise<Application> {
  const created = await commitStatusWrite({
    userId,
    existingId: null,
    source: "CREATE",
    write: (tx) => tx.application.create({ data: { ...data, userId } }),
  })
  // Unreachable: with `existingId: null` there is no ownership branch and
  // `create` cannot return null. It is asserted rather than cast so the
  // caller's return type stays non-nullable without a lie in it.
  if (!created) throw new Error("Application was not created")
  return created
}

/**
 * §7.1 path 3 — THE PATH THAT SILENTLY BREAKS THE FUNNEL.
 *
 * A reviewer who reads `updateStatus` concludes status writes are centralised
 * in the board drag. They are not: this writes `status` as one field of a
 * full-row write, shares the create sheet's seven-option select, and is
 * reachable from every board card, the applications table AND the company
 * detail page.
 *
 * Every optional field gets `?? null` rather than being passed through as part
 * of `data`: Prisma treats `undefined` as "leave unchanged", so a cleared field
 * (jobUrl, location, workMode, salaryMin, salaryMax, currency, source,
 * appliedAt, notes, resumeVersionId) would silently never clear — same trap as
 * resume-repository.ts's `update`.
 */
export function update(
  userId: string,
  id: string,
  data: CreateApplicationInput
): Promise<Application | null> {
  return commitStatusWrite({
    userId,
    existingId: id,
    source: "EDIT_FORM",
    write: async (tx) => {
      const [row] = await tx.application.updateManyAndReturn({
        where: { id, userId },
        data: {
          companyId: data.companyId,
          roleTitle: data.roleTitle,
          status: data.status,
          jobUrl: data.jobUrl ?? null,
          location: data.location ?? null,
          workMode: data.workMode ?? null,
          salaryMin: data.salaryMin ?? null,
          salaryMax: data.salaryMax ?? null,
          currency: data.currency ?? null,
          source: data.source ?? null,
          appliedAt: data.appliedAt ?? null,
          notes: data.notes ?? null,
          resumeVersionId: data.resumeVersionId ?? null,
        },
      })
      return row ?? null
    },
  })
}

/** §7.1 path 2 — the board's pointer drag and its keyboard drag. */
export function updateStatus(
  userId: string,
  id: string,
  status: ApplicationStatus
): Promise<Application | null> {
  return commitStatusWrite({
    userId,
    existingId: id,
    source: "BOARD_DRAG",
    write: async (tx) => {
      const [row] = await tx.application.updateManyAndReturn({
        where: { id, userId },
        data: { status },
      })
      return row ?? null
    },
  })
}

/** §7.1 path 4. Not a status write — the row goes, and its events go with it
 *  (§6.4, Cascade). The accepted cost is that conversion rates recompute when
 *  the user tidies up. */
export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.application.deleteMany({ where: { id, userId } })
  return count > 0
}

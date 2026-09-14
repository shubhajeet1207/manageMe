import Link from "next/link"
import { auth } from "@/lib/auth/auth"
import { findById } from "@/server/repositories/user-repository"
import { getDashboardSummary } from "@/server/services/analytics-service"
import type { DashboardSummary } from "@/server/services/analytics-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_ACCENT, STATUS_LABELS } from "@/components/status-badge"
import { STATUS_ORDER } from "@/lib/status-order"
import { cn } from "@/lib/utils"

const NOTHING_TRACKED: DashboardSummary = {
  tracked: 0,
  inPlay: 0,
  nowAtInterviewOrBetter: 0,
  everReachedInterview: null,
  movedThisWeek: null,
  pipeline: STATUS_ORDER.map((status) => ({ status, count: 0 })),
}

type Tile = { label: string; value: number | null; note?: string }

/**
 * Current-state first. This is the page opened twenty times a day, so it
 * answers "where does everything stand"; the retrospective belongs on
 * /analytics, which is opened monthly (§9.2).
 *
 * The counts come from one `groupBy` in the analytics service rather than from
 * `listApplications`, which used to fetch every row with its company joined in
 * order to render ten integers through in-memory filters.
 */
export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id
  const user = userId ? await findById(userId) : null
  const name = user?.name ?? user?.email ?? "there"
  const summary = userId ? await getDashboardSummary(userId) : NOTHING_TRACKED

  const tiles: Tile[] = [
    { label: "Tracked", value: summary.tracked },
    { label: "In play", value: summary.inPlay },
    // "Now at", not "Interview or better": the old label read as a reached-stage
    // count, which is a different and usually larger number. The tile below
    // teaches the difference by sitting next to it.
    { label: "Now at interview or better", value: summary.nowAtInterviewOrBetter },
  ]

  // Appears only once there is history to count. Before that it would show the
  // same number as the tile above it, which teaches the opposite of the point.
  if (summary.everReachedInterview !== null) {
    tiles.push({
      label: "Ever reached interview",
      value: summary.everReachedInterview,
      note: "Counted from recorded moves.",
    })
  }

  tiles.push({
    label: "Moved this week",
    value: summary.movedThisWeek,
    note:
      summary.movedThisWeek === null
        ? "Nothing recorded yet — status changes start appearing here as you move cards."
        : undefined,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${name}`}
        description="Where every application stands right now."
      >
        <Button asChild>
          <Link href="/applications">Open the board</Link>
        </Button>
      </PageHeader>

      {summary.tracked === 0 ? (
        <EmptyState
          title="Nothing in the pipeline yet"
          description="Add an application and the funnel below will start filling in."
        >
          <Button asChild>
            <Link href="/applications">Add an application</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <dl className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="border-border bg-card rounded-lg border px-4 py-3"
              >
                <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                  {tile.label}
                </dt>
                {/* A dash, never a zero: before anything is recorded, a zero
                    asserts that nothing happened when nothing was watching. */}
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {tile.value ?? "—"}
                </dd>
                {tile.note && (
                  <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                    {tile.note}
                  </p>
                )}
              </div>
            ))}
          </dl>

          <section
            aria-label="Pipeline"
            className="border-border bg-card space-y-4 rounded-lg border p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                Pipeline
              </h2>
              <Link
                href="/analytics"
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
              >
                See the full picture →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              {summary.pipeline.map(({ status, count }) => (
                <div
                  key={status}
                  className={cn(
                    "min-w-0",
                    status === "REJECTED" && "border-border lg:ml-2 lg:border-l lg:pl-3"
                  )}
                >
                  <div
                    className={cn("h-[3px] w-full rounded-full", STATUS_ACCENT[status])}
                    aria-hidden
                  />
                  <p
                    className={cn(
                      "mt-2 truncate text-[11px] font-semibold tracking-[0.09em] uppercase",
                      status === "REJECTED" && "text-muted-foreground"
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </p>
                  <p className="mt-0.5 text-lg font-medium tabular-nums">{count}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

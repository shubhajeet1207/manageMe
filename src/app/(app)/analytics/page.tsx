import Link from "next/link"
import { auth } from "@/lib/auth/auth"
import { getDashboardSummary, getFunnel } from "@/server/services/analytics-service"
import type { Conversion, StageCount } from "@/server/services/analytics-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_ACCENT, STATUS_LABELS } from "@/components/status-badge"
import { cn } from "@/lib/utils"

/**
 * Every section states which class its numbers belong to (§9.1). The label is
 * load-bearing, not decoration: "3 interviews" counted from current state and
 * "3 interviews" counted from recorded history are different claims, and a
 * reader who cannot tell them apart will trust the wrong one.
 */
function ClassNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{children}</p>
}

/** A rate computed from nothing is unanswerable, not 0%. Null renders as a
 *  dash with its denominator beside it, never as a zero that would assert a
 *  failure that did not happen. */
function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

function FunnelBar({ stage, max }: { stage: StageCount; max: number }) {
  // Guard the zero denominator rather than letting 0/0 reach the style attribute.
  const width = max === 0 ? 0 : (stage.count / max) * 100
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3">
      <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-[0.09em] uppercase">
        {STATUS_LABELS[stage.status]}
      </span>
      <div className="bg-muted h-5 w-full overflow-hidden rounded-sm">
        <div
          className={cn("h-full rounded-sm", STATUS_ACCENT[stage.status])}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-right text-sm font-medium tabular-nums">{stage.count}</span>
    </div>
  )
}

function ConversionRow({ conversion }: { conversion: Conversion }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-2">
      <span className="text-sm">
        {STATUS_LABELS[conversion.from]}
        <span className="text-muted-foreground px-1.5">to</span>
        {STATUS_LABELS[conversion.to]}
      </span>
      <span className="text-right text-sm tabular-nums">
        <span className="font-semibold">{formatRate(conversion.rate)}</span>
        <span className="text-muted-foreground ml-2 text-[11px]">
          {conversion.numerator}/{conversion.denominator}
        </span>
      </span>
    </div>
  )
}

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    return (
      <EmptyState
        title="Sign in to see your analytics"
        description="These figures are computed from your own applications only."
      />
    )
  }

  const [funnel, summary] = await Promise.all([
    getFunnel(session.user.id),
    getDashboardSummary(session.user.id),
  ])

  const maxReached = Math.max(0, ...funnel.reached.map((stage) => stage.count))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="What your pipeline has actually done, not just where it stands."
      />

      <section
        aria-label="Current state"
        className="border-border bg-card space-y-3 rounded-lg border p-4"
      >
        <div>
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
            Right now
          </h2>
          <ClassNote>
            Counted from where applications sit today. Accurate from the moment you start,
            and silent about how they got there.
          </ClassNote>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Tracked", value: summary.tracked },
            { label: "In play", value: summary.inPlay },
            { label: "At interview or better", value: summary.nowAtInterviewOrBetter },
          ].map((stat) => (
            <div key={stat.label} className="border-border rounded-lg border px-4 py-3">
              <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {funnel.empty ? (
        <EmptyState
          title="No history recorded yet"
          description="The funnel fills in as you move applications between stages. Nothing is missing — there is simply nothing to report until the first move is recorded."
        >
          <Button asChild>
            <Link href="/applications">Open the board</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <section
            aria-label="Stages reached"
            className="border-border bg-card space-y-4 rounded-lg border p-4"
          >
            <div>
              <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                Stages reached
              </h2>
              <ClassNote>
                Recorded history: how many applications ever reached each stage, counted
                once each. One that moved back and forth counts once, because it did reach
                the stage. Rejected is not a stage here — it is where applications leave
                from, and it is reported below.
              </ClassNote>
            </div>
            <div className="space-y-2">
              {funnel.reached.map((stage) => (
                <FunnelBar key={stage.status} stage={stage} max={maxReached} />
              ))}
            </div>
            {funnel.skippedStageCount > 0 && (
              <p className="text-muted-foreground border-border border-t pt-3 text-[11px] leading-relaxed">
                {funnel.skippedStageCount}{" "}
                {funnel.skippedStageCount === 1 ? "application" : "applications"} jumped a
                stage, so an empty row above may mean the stage was passed over rather than
                never reached.
              </p>
            )}
            {funnel.backfilledOnly > 0 && (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {funnel.backfilledOnly}{" "}
                {funnel.backfilledOnly === 1 ? "application is" : "applications are"}{" "}
                excluded: their only history predates status tracking, which tells us where
                they stand but not what they passed through.
              </p>
            )}
          </section>

          <section
            aria-label="Conversion"
            className="border-border bg-card space-y-2 rounded-lg border p-4"
          >
            <div>
              <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                Conversion
              </h2>
              <ClassNote>
                Of everything that reached a stage, the share that went on to the next. A
                dash means nothing has reached the earlier stage yet, so there is no
                question to answer.
              </ClassNote>
            </div>
            <div className="divide-border divide-y">
              {funnel.conversions.map((conversion) => (
                <ConversionRow key={conversion.from} conversion={conversion} />
              ))}
            </div>
            <p className="text-muted-foreground border-border border-t pt-3 text-[11px]">
              Closed as rejected:{" "}
              <span className="tabular-nums">{funnel.closedRejected}</span>
            </p>
          </section>
        </>
      )}
    </div>
  )
}

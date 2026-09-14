import Link from "next/link"
import { auth } from "@/lib/auth/auth"
import {
  getActivity,
  getDashboardSummary,
  getFunnel,
  getVelocity,
  MIN_SAMPLE_FOR_MEDIAN,
  publishedMedianDays,
} from "@/server/services/analytics-service"
import type {
  ActivityEntry,
  ActivitySource,
  Conversion,
  MetricClass,
  OpenStageAge,
  StageCount,
  StageDuration,
} from "@/server/services/analytics-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_ACCENT, STATUS_LABELS } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { formatDate } from "../resumes/format"

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

/** One decimal, trailing ".0" dropped: "3" and "12.5", never "3.0". Durations
 *  here are real numbers of days, not whole days — an application dragged twice
 *  in an afternoon produces a genuine 0.1. */
function days1(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function formatDays(value: number): string {
  // "0 days" would read as "no time at all" for something that did take time.
  if (value < 0.1) return "under an hour"
  const rounded = days1(value)
  return `${rounded} ${rounded === "1" ? "day" : "days"}`
}

/**
 * One bar per stage, scaled to the longest published median (§10.2). Below
 * MIN_SAMPLE_FOR_MEDIAN the row shows its raw sorted durations instead of a
 * bar, because there is no median to draw — and a bar drawn from two
 * observations would be indistinguishable from one drawn from fifty.
 */
function StageDurationRow({ stage, max }: { stage: StageDuration; max: number }) {
  const published = publishedMedianDays(stage)
  const width = published === null || max === 0 ? 0 : (published / max) * 100

  return (
    <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
      <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-[0.09em] uppercase">
        {STATUS_LABELS[stage.status]}
      </span>
      {published === null ? (
        <span className="text-muted-foreground text-[11px]">
          {stage.n === 0
            ? "No completed interval yet"
            : `${stage.durationsDays.map(days1).join(", ")} days`}
        </span>
      ) : (
        <div className="bg-muted h-5 w-full overflow-hidden rounded-sm">
          <div
            className={cn("h-full rounded-sm", STATUS_ACCENT[stage.status])}
            style={{ width: `${width}%` }}
          />
        </div>
      )}
      <span className="text-right text-sm tabular-nums">
        {published === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="font-semibold">{days1(published)}d</span>
        )}
        <span className="text-muted-foreground ml-2 text-[11px]">n&nbsp;=&nbsp;{stage.n}</span>
      </span>
    </div>
  )
}

/** The table twin every figure on this page carries (§10.4): native
 *  `<details>`, so it is keyboard-operable and announced correctly without one
 *  line of JavaScript — which is what keeps this page a Server Component. */
function StageDurationTable({ stages }: { stages: StageDuration[] }) {
  return (
    <details className="border-border border-t pt-3">
      <summary className="text-muted-foreground cursor-pointer text-[11px]">
        Show the numbers
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Stage</th>
              <th className="py-1 pr-3 font-medium">Median days</th>
              <th className="py-1 pr-3 font-medium">n</th>
              <th className="py-1 font-medium">Completed intervals (days)</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {stages.map((stage) => {
              const published = publishedMedianDays(stage)
              return (
                <tr key={stage.status}>
                  <td className="py-1 pr-3">{STATUS_LABELS[stage.status]}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {published === null ? "—" : days1(published)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{stage.n}</td>
                  <td className="text-muted-foreground py-1">
                    {stage.n === 0 ? "—" : stage.durationsDays.map(days1).join(", ")}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function OldestRow({ age }: { age: OpenStageAge }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {age.companyName} <span className="text-muted-foreground">—</span> {age.roleTitle}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          <span className="font-medium">{STATUS_LABELS[age.status]}</span>
          {age.stageMedianDays === null
            ? " · no median for this stage yet, so there is nothing to compare it to"
            : ` · your median for this stage is ${formatDays(age.stageMedianDays)}`}
        </p>
      </div>
      <div className="text-right">
        <span className="text-sm font-semibold tabular-nums">{formatDays(age.days)}</span>
        {age.stalled && (
          <p className="mt-0.5 text-[11px] font-medium">Longer than your own median</p>
        )}
      </div>
    </div>
  )
}

/** Names the table each entry came from. The verb already says what happened;
 *  this says where the app learned it, which is what makes the class beside it
 *  meaningful. */
const ACTIVITY_SOURCE_LABEL: Record<ActivitySource, string> = {
  STATUS_CHANGE: "Status",
  STATUS_BACKFILL: "Status",
  APPLICATION_ADDED: "Application",
  TASK_COMPLETED: "Task",
  DOCUMENT_FILED: "Document",
  RESUME_VERSION: "Resume",
}

/** §9.1's three classes, said in the words a timeline reader needs. A date that
 *  is exact for the ROW but not for the EVENT is neither recorded nor
 *  approximate — it is a filing date, and saying so is the whole point. */
const ACTIVITY_CLASS_LABEL: Record<MetricClass, string> = {
  recorded: "recorded",
  approximate: "approximate",
  "current-state": "filing date",
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const backfilled = entry.source === "STATUS_BACKFILL"

  return (
    <li className="flex gap-3 py-2">
      {/* A dashed rule for a synthetic row, a solid stage accent for a real one
          (§8.4c). Decorative: everything it encodes is in the text beside it. */}
      <span
        aria-hidden
        className={cn(
          "mt-1 shrink-0 self-stretch rounded-full",
          backfilled
            ? "border-muted-foreground/40 w-0 border-l-2 border-dashed"
            : cn("w-0.5", entry.status ? STATUS_ACCENT[entry.status] : "bg-border")
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", backfilled && "text-muted-foreground")}>
          {entry.verb && <span>{entry.verb} </span>}
          <Link href={entry.href} className="font-medium hover:underline">
            {entry.subject}
          </Link>
          {entry.status &&
            (backfilled
              ? ` · status recorded as ${STATUS_LABELS[entry.status]}`
              : ` to ${STATUS_LABELS[entry.status]}`)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {ACTIVITY_SOURCE_LABEL[entry.source]} · {ACTIVITY_CLASS_LABEL[entry.metricClass]}
          {backfilled &&
            " — this date is the application's last edit, not when the status changed"}
        </p>
      </div>
      <time
        dateTime={entry.at.toISOString()}
        className="text-muted-foreground shrink-0 text-[11px] tabular-nums"
      >
        {entry.at.toISOString().slice(11, 16)}
      </time>
    </li>
  )
}

/** Grouped by UTC day, ISO-formatted. A locale-formatted date renders
 *  differently on the server and the client and trips hydration — the same
 *  reason `formatDate` exists and is imported rather than re-derived. */
function groupByDay(entries: ActivityEntry[]): { day: string; entries: ActivityEntry[] }[] {
  const days: { day: string; entries: ActivityEntry[] }[] = []
  for (const entry of entries) {
    const day = formatDate(entry.at)
    const last = days[days.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else days.push({ day, entries: [entry] })
  }
  return days
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

  const [funnel, summary, velocity, activity] = await Promise.all([
    getFunnel(session.user.id),
    getDashboardSummary(session.user.id),
    getVelocity(session.user.id),
    getActivity(session.user.id),
  ])

  const maxReached = Math.max(0, ...funnel.reached.map((stage) => stage.count))
  // Scaled to the longest median this page will PRINT, not the longest it
  // computed: a bar scaled to a median the page refuses to show would be a
  // rectangle with no number anywhere to explain its length.
  const maxMedian = Math.max(
    0,
    ...velocity.stages.map((stage) => publishedMedianDays(stage) ?? 0)
  )
  const activityDays = groupByDay(activity.entries)

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

          <section
            aria-label="Time in stage"
            className="border-border bg-card space-y-4 rounded-lg border p-4"
          >
            <figure className="space-y-4">
              <figcaption>
                <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                  Time in stage
                </h2>
                <ClassNote>
                  Recorded history: the median of the intervals that have{" "}
                  <em>finished</em> — an application still sitting in a stage has not
                  finished being in it, so counting it would make every stage look faster
                  than it is. n is the number of finished intervals behind each figure, and
                  below {MIN_SAMPLE_FOR_MEDIAN} of them the durations themselves are shown
                  instead: a median of two numbers is an average wearing a disguise.
                </ClassNote>
              </figcaption>
              {velocity.stages.every((stage) => stage.n === 0) ? (
                <p className="text-muted-foreground text-sm">
                  Nothing recorded yet. A duration needs two recorded moves on the same
                  application — the first one starts the clock.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {velocity.stages.map((stage) => (
                      <StageDurationRow key={stage.status} stage={stage} max={maxMedian} />
                    ))}
                  </div>
                  <StageDurationTable stages={velocity.stages} />
                </>
              )}
            </figure>
          </section>

          <section
            aria-label="Oldest in stage"
            className="border-border bg-card space-y-3 rounded-lg border p-4"
          >
            <div>
              <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                Oldest in stage
              </h2>
              <ClassNote>
                Current state: how long each open application has been where it is,
                measured from its last recorded move. The comparison is to your own median
                for that stage and to nothing else — no threshold is invented here, so a
                stage with too few finished intervals flags nothing at all.
              </ClassNote>
            </div>
            {velocity.oldest.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing to age. Every open application entered its current stage before its
                history was being recorded, or there are no open applications.
              </p>
            ) : (
              <div className="divide-border divide-y">
                {velocity.oldest.map((age) => (
                  <OldestRow key={age.applicationId} age={age} />
                ))}
              </div>
            )}
            {velocity.stalledCount > 0 && (
              <p className="text-muted-foreground border-border border-t pt-3 text-[11px] leading-relaxed">
                {velocity.stalledCount}{" "}
                {velocity.stalledCount === 1 ? "application has" : "applications have"} been
                in their current stage longer than your median for it. That is a prompt to
                look, not a verdict — a long interview stage is often a good sign.
              </p>
            )}
            {velocity.unmeasurableOpen > 0 && (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {velocity.unmeasurableOpen}{" "}
                {velocity.unmeasurableOpen === 1
                  ? "open application is"
                  : "open applications are"}{" "}
                left out: the moment they entered their current stage was never recorded, so
                any age would be measured from the wrong instant. A missing row is a smaller
                lie than a wrong one.
              </p>
            )}
          </section>
        </>
      )}

      <section
        aria-label="Recent activity"
        className="border-border bg-card space-y-3 rounded-lg border p-4"
      >
        <div>
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
            Recent activity
          </h2>
          <ClassNote>
            Mixed, and marked per entry. <strong>Recorded</strong> is the instant the thing
            happened, written when it happened. <strong>Filing date</strong> is when you
            created the row, which is exact for the row and says nothing about when you
            applied or when the document was issued. <strong>Approximate</strong> is a
            status that predates recording: its date is the application&rsquo;s last edit.
            Grouped by UTC day; times are UTC.
          </ClassNote>
        </div>
        {activityDays.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing yet. Adding an application, completing a task or filing a document all
            show up here.
          </p>
        ) : (
          <div className="space-y-4">
            {activityDays.map((group) => (
              <div key={group.day}>
                <h3 className="text-muted-foreground border-border border-b pb-1 text-[11px] font-semibold tracking-[0.07em] tabular-nums">
                  {group.day}
                </h3>
                <ul className="divide-border divide-y">
                  {group.entries.map((entry) => (
                    <ActivityRow key={entry.key} entry={entry} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import Link from "next/link"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  ApplicationWithCompanyAndVersion,
  ResumeStats,
} from "@/server/repositories/resume-repository"

function Stat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="border-card-border bg-card rounded-lg border px-3 py-2.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {detail ? (
        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{detail}</p>
      ) : null}
    </div>
  )
}

/** The two groups are labelled rather than merged into one row of six tiles,
 *  because the numbers answer different questions and a reader scanning a flat
 *  row would read the larger recorded figure as a correction to the smaller
 *  current one rather than as a different claim. */
function GroupHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}

export function ResumeUsage({
  stats,
  applications,
}: {
  stats: ResumeStats
  applications: ApplicationWithCompanyAndVersion[]
}) {
  // A percentage over a zero denominator is a lie with a division sign in it.
  if (stats.applications === 0) {
    return (
      <EmptyState
        title="Not used yet"
        description="No application records a version of this resume. Link one from the application form and how it fares shows up here."
      />
    )
  }

  // Two denominators, never one. A reached figure can only be drawn from the
  // applications something was watching, so dividing it by every application
  // would understate the resume by exactly the coverage gap — and the old
  // "interview rate" wording is gone with it, because that phrase reads as a
  // reached rate while the number under it was a current-state count.
  const shareOfAll = (part: number) =>
    `${Math.round((part / stats.applications) * 100)}% of ${stats.applications}`
  const shareOfRecorded = (part: number) =>
    `${Math.round((part / stats.recordedApplications) * 100)}% of ${stats.recordedApplications}`

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <GroupHeading
          title="Where they stand now"
          hint="Each application counted once, under the stage it sits at today."
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Applications" value={String(stats.applications)} />
          {/* "Now at", not "At": the label has to survive being read next to
              "Ever reached interview" three inches below it, where the two
              numbers are usually different and the difference is the point. */}
          <Stat
            label="Now at interview or better"
            value={String(stats.atInterviewOrBeyond)}
            detail={shareOfAll(stats.atInterviewOrBeyond)}
          />
          <Stat
            label="Now at offer or better"
            value={String(stats.offers)}
            detail={shareOfAll(stats.offers)}
          />
          <Stat label="Now rejected" value={String(stats.rejected)} />
        </div>
      </div>

      <div className="space-y-2">
        <GroupHeading
          title="What they reached"
          hint="Counted from recorded moves, however the application ended up."
        />
        {/* A zero denominator renders nothing, never zeroes: before any move
            was recorded, "0 ever reached interview" asserts that nothing
            happened when in fact nothing was watching. Same rule as the
            dashboard's tile and the companies table's dash. */}
        {stats.recordedApplications === 0 ? (
          <p className="text-muted-foreground max-w-3xl text-xs">
            Nothing recorded against this resume yet. These applications predate
            status recording or have not moved since, so what they reached on the
            way is not known &mdash; only where they sit now, above. Move one on the
            board and it starts being counted here.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Ever reached interview"
                value={String(stats.everReachedInterview)}
                detail={shareOfRecorded(stats.everReachedInterview)}
              />
              <Stat
                label="Ever reached offer"
                value={String(stats.everReachedOffer)}
                detail={shareOfRecorded(stats.everReachedOffer)}
              />
            </div>
            <p className="text-muted-foreground max-w-3xl text-xs">
              An application that interviewed and was then rejected counts under
              Now rejected above <em>and</em> under Ever reached interview here
              &mdash; the resume did its job even though the application did not
              work out.{" "}
              {stats.recordedApplications < stats.applications ? (
                <>
                  These two count only the {stats.recordedApplications} of{" "}
                  {stats.applications} application
                  {stats.applications === 1 ? "" : "s"} with recorded history; the
                  rest moved before anything was watching and can appear in
                  neither number.
                </>
              ) : null}
            </p>
          </>
        )}
      </div>

      <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
        <Table className="min-w-[720px] lg:min-w-[560px]">
          <TableHeader className="bg-well/70">
            <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id} className="[&>td]:px-3 [&>td]:py-1.5">
                <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                  <Link href={`/companies/${application.companyId}`} className="hover:underline">
                    {application.company.name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                  {application.roleTitle}
                </TableCell>
                <TableCell>
                  <StatusBadge status={application.status} />
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                  {application.resumeVersion?.label ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

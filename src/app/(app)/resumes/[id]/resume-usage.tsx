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

  const rate = (part: number) => `${Math.round((part / stats.applications) * 100)}%`

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Applications" value={String(stats.applications)} />
        <Stat
          label="At interview or beyond"
          value={String(stats.atInterviewOrBeyond)}
          detail={`${rate(stats.atInterviewOrBeyond)} interview rate`}
        />
        <Stat
          label="Offers"
          value={String(stats.offers)}
          detail={`${rate(stats.offers)} offer rate`}
        />
        <Stat label="Rejected" value={String(stats.rejected)} />
      </div>

      {/* The rates understate, and saying so is cheaper than overclaiming them.
          Status is a current state, not a history. */}
      <p className="text-muted-foreground max-w-3xl text-xs">
        These count where applications stand <em>now</em>, not every stage they
        reached: one that interviewed and was then rejected counts only under
        Rejected. A true reached-stage rate needs status history, which this phase
        does not record.
      </p>

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

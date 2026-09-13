import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { ResumeVersionWithResume } from "@/server/repositories/resume-repository"
import type { Company } from "@prisma/client"
import { tasksHref } from "../tasks/search-params"
import { ApplicationSheet } from "./application-sheet"
import { DeleteApplicationDialog } from "./delete-application-dialog"

function formatResume(
  app: ApplicationWithCompany,
  versionById: Map<string, ResumeVersionWithResume>
) {
  const version = app.resumeVersionId ? versionById.get(app.resumeVersionId) : undefined
  return version ? `${version.resume.name} · ${version.label}` : "—"
}

function formatSalary(app: ApplicationWithCompany) {
  if (app.salaryMin == null && app.salaryMax == null) return "—"
  const currency = app.currency ? `${app.currency} ` : ""
  if (app.salaryMin != null && app.salaryMax != null) {
    return `${currency}${app.salaryMin.toLocaleString()}–${app.salaryMax.toLocaleString()}`
  }
  const single = app.salaryMin ?? app.salaryMax
  return `${currency}${single!.toLocaleString()}`
}

export function ApplicationTable({
  applications,
  companies = [],
  versions = [],
  openTaskCounts = new Map(),
  taskCounts = new Map(),
}: {
  applications: ApplicationWithCompany[]
  companies?: Pick<Company, "id" | "name">[]
  versions?: ResumeVersionWithResume[]
  // Computed for the whole page in ONE grouped query, not per row.
  openTaskCounts?: Map<string, number>
  // Every task, open or finished: the delete dialog unlinks all of them.
  taskCounts?: Map<string, number>
}) {
  // The link is to a version, so the slot's name comes from the version list
  // the page already loads for the picker rather than a second query per row.
  const versionById = new Map(versions.map((version) => [version.id, version]))

  return (
    // One scroll container, not two. <Table> wraps itself in an overflow-x:auto
    // div, so the table used to scroll *inside* the bordered frame against a
    // macOS overlay scrollbar: at 1440 a 1152px table sat in a 1134px frame and
    // the ACTIONS header rendered as "ACTION" with nothing on screen to say the
    // rest was 18px away. Neutralising the inner container puts the overflow on
    // the frame itself, where the rail is visible. From lg up the min width
    // sits under the narrowest desktop frame — 718px at 1024 — so the table
    // simply fits; below that it keeps a wider strip and scrolls, because
    // seven columns crushed into 356px is not a table.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[960px] lg:min-w-[760px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
            {/* Eight columns hold at 1280 and above — measured, with a
                worst-case resume name the cell wraps to three lines and the
                frame still does not overflow. Below xl the strip is already
                scrolling seven columns, and the resume is the one the row's
                own sheet carries at every width. */}
            <TableHead className="hidden xl:table-cell">Resume</TableHead>
            <TableHead className="xl:w-28">Applied</TableHead>
            <TableHead className="xl:w-40">Salary</TableHead>
            {/* Narrow and right-aligned, blank at zero: a column that says "0"
                on every row is a column that costs width and says nothing. */}
            <TableHead className="w-16 text-right">Tasks</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                <Link href={`/companies/${app.companyId}`} className="hover:underline">
                  {app.company.name}
                </Link>
              </TableCell>
              <TableCell className="whitespace-normal [overflow-wrap:anywhere]">{app.roleTitle}</TableCell>
              <TableCell>
                <StatusBadge status={app.status} />
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                {app.location ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground hidden whitespace-normal [overflow-wrap:anywhere] xl:table-cell">
                {formatResume(app, versionById)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {app.appliedAt ? app.appliedAt.toISOString().slice(0, 10) : "—"}
              </TableCell>
              {/* The one cell allowed to wrap at a width the nowrap default
                  cannot survive: a currency range is 150px of unbreakable
                  text, and at 1024 the seven columns are 49px over the frame
                  without it. It breaks after the en dash, never inside a
                  number. */}
              <TableCell className="text-muted-foreground tabular-nums whitespace-normal">
                {formatSalary(app)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {openTaskCounts.get(app.id) ? (
                  <Link href={tasksHref({ applicationId: app.id })} className="hover:underline">
                    {openTaskCounts.get(app.id)}
                  </Link>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <ApplicationSheet
                  companies={companies}
                  versions={versions}
                  application={app}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteApplicationDialog
                  applicationId={app.id}
                  label={`${app.roleTitle} at ${app.company.name}`}
                  taskCount={taskCounts.get(app.id) ?? 0}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

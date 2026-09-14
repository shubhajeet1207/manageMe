import Link from "next/link"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
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
import {
  naturalDirectionFor,
  type ApplicationSort,
  type ApplicationSortKey,
} from "@/lib/application-sort"
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

/** What a sortable header needs beyond its own label: the sort currently in
 *  effect, and the page's own link builder. Both are optional together — see
 *  the first branch of `SortableHead`. */
type SortContext = {
  sort?: ApplicationSort
  sortHref?: (next: ApplicationSort) => string
}

function SortableHead({
  sortKey,
  label,
  className,
  sort,
  sortHref,
}: SortContext & {
  sortKey: ApplicationSortKey
  label: string
  className?: string
}) {
  // Sorting is opt-in. The company detail page renders this same table with no
  // sort context, and a header there must stay plain text: a link would send
  // the reader to /applications, out of the company they were reading, and
  // would claim a sort that page never applied.
  if (!sort || !sortHref) return <TableHead className={className}>{label}</TableHead>

  const active = sort.key === sortKey
  // An active header flips its own direction; an idle one opens in ITS natural
  // direction rather than inheriting whichever direction the previous column
  // happened to be using — "sort by role" after "newest applied" should give
  // A-Z, not Z-A.
  const next: ApplicationSort = active
    ? { key: sortKey, direction: sort.direction === "asc" ? "desc" : "asc" }
    : { key: sortKey, direction: naturalDirectionFor(sortKey) }

  const Arrow = !active ? ArrowUpDownIcon : sort.direction === "asc" ? ArrowUpIcon : ArrowDownIcon

  return (
    <TableHead
      className={className}
      // "none", not omitted: on a sortable column the attribute is the only
      // thing telling a screen reader the column CAN be sorted and currently
      // is not. The link's accessible name stays the bare column label on
      // purpose — a screen reader re-announces the column header on every row,
      // so an "activate to sort ascending" hint here would be read out once
      // per cell for the length of the table. aria-sort carries the state; the
      // arrow carries it visually and is hidden from assistive tech.
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={sortHref(next)}
        className="hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 outline-none transition-colors focus-visible:ring-[3px]"
      >
        {label}
        <Arrow aria-hidden className={active ? "size-3" : "size-3 opacity-40"} />
      </Link>
    </TableHead>
  )
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
  sort,
  sortHref,
}: SortContext & {
  applications: ApplicationWithCompany[]
  companies?: Pick<Company, "id" | "name">[]
  versions?: ResumeVersionWithResume[]
  // Computed for the whole page in ONE grouped query, not per row.
  openTaskCounts?: Map<string, number>
  // Every task, open or finished: the delete dialog unlinks all of them.
  taskCounts?: Map<string, number>
}) {
  // `applications` arrives already ordered: the query that produced it is the
  // sort these headers describe. The table never re-sorts, because a second
  // implementation of the same ordering is a second, silently different
  // opinion about it — pipeline order especially, which no client-side
  // comparator here would know about.
  const sorting: SortContext = { sort, sortHref }
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
    //
    // Both floors then moved by 112px for the Updated column — an ISO date at
    // this type size plus the row's px-3. That is arithmetic on the numbers
    // above, NOT a fresh measurement in a browser. It is a safe way to be
    // wrong: the frame still owns the overflow, so being off by a few pixels
    // costs a slightly longer scroll on a visible rail, not a clipped header.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[1072px] lg:min-w-[872px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <SortableHead sortKey="company" label="Company" {...sorting} />
            <SortableHead sortKey="role" label="Role" {...sorting} />
            <SortableHead sortKey="status" label="Status" {...sorting} />
            <TableHead>Location</TableHead>
            {/* Eight columns held at 1280 and above when this was measured —
                with a worst-case resume name the cell wraps to three lines and
                the frame still does not overflow. Updated has since made nine;
                see the width note above for what that did to the floors. Below
                xl the strip is already scrolling, and the resume is the one
                thing the row's own sheet carries at every width. */}
            <TableHead className="hidden xl:table-cell">Resume</TableHead>
            <SortableHead sortKey="applied" label="Applied" className="xl:w-28" {...sorting} />
            {/* Carries its weight twice over: it is the column the table is
                sorted by out of the box, so without it the default order is
                both unlabelled (every other header would report aria-sort
                "none" on a table that is in fact sorted) and unreachable — no
                header to click to get back to it. Visible at every width for
                the same reason; hiding it below xl would take the way back
                with it. */}
            <SortableHead sortKey="updated" label="Updated" className="xl:w-28" {...sorting} />
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
              <TableCell className="text-muted-foreground tabular-nums">
                {app.updatedAt.toISOString().slice(0, 10)}
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

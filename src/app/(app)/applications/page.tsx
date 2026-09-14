import { redirect } from "next/navigation"
import type { ApplicationStatus } from "@prisma/client"
import { auth } from "@/lib/auth/auth"
import {
  isDefaultApplicationSort,
  resolveApplicationSort,
  type ApplicationSort,
} from "@/lib/application-sort"
import { listByUser } from "@/server/repositories/application-repository"
import { listCompanies } from "@/server/services/company-service"
import { listVersionsForUser } from "@/server/services/resume-service"
import {
  countOpenTasksByApplication,
  countTasksByApplication,
} from "@/server/services/task-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_LABELS } from "@/components/status-badge"
import { ApplicationBoard } from "./application-board"
import { ApplicationSheet } from "./application-sheet"
import { ApplicationTable } from "./application-table"
import { applicationsHref, parseStatus, parseView } from "./search-params"
import { StatusFilter } from "./status-filter"
import { ViewToggle } from "./view-toggle"

// STATUS_LABELS is keyed by the enum, but any string can be indexed into it at
// runtime; an unexpected key (e.g. an inherited object property like
// "toString") would otherwise return a non-string and crash `.toLowerCase()`.
function filterStatusLabel(status: ApplicationStatus): string {
  const label = STATUS_LABELS[status]
  return typeof label === "string" ? label : "matching"
}

/**
 * Adds the sort to a link the existing `applicationsHref` built, rather than
 * teaching that helper a third parameter: every other control on the page
 * (the view toggle, the status filter) goes through it, and widening it is a
 * change to their shared path. Composing keeps the sort links carrying the
 * filter the user already chose.
 *
 * The default sort is spelled by its ABSENCE. `/applications?view=table` has
 * always meant "most recently updated first" and still does, so a link back to
 * the default is the plain URL rather than a second spelling of it that the
 * back button would treat as a different page.
 */
function withSort(href: string, sort: ApplicationSort): string {
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  if (!isDefaultApplicationSort(sort)) {
    params.set("sort", sort.key)
    params.set("dir", sort.direction)
  }
  return `${path}?${params.toString()}`
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; sort?: string; dir?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const params = await searchParams
  const view = parseView(params.view)
  const statusFilter = parseStatus(params.status)
  // Resolved here as well as in the repository, because the headers have to
  // render the sort that was actually APPLIED: echoing `params.sort` back into
  // aria-sort would have `?sort=toString` draw an arrow on a column the query
  // ignored. `resolveApplicationSort` is idempotent, so both layers agree.
  const sort = resolveApplicationSort({ key: params.sort, direction: params.dir })

  const [all, companies, versions, openTaskCounts, taskCounts] = await Promise.all([
    // Straight to the repository: `listApplications` is a passthrough that
    // takes no sort argument, and this page owns neither it nor the service.
    // Same shape as the dashboard and settings pages, which read
    // user-repository directly.
    listByUser(session.user.id, sort),
    listCompanies(session.user.id),
    listVersionsForUser(session.user.id),
    // Two grouped queries for the whole page, not a count per row: the column
    // shows open tasks, the delete dialog names every task it will unlink.
    countOpenTasksByApplication(session.user.id),
    countTasksByApplication(session.user.id),
  ])
  // Filtering is a table-view affordance (§7); the board always shows the whole
  // pipeline, or its columns would lie about what the pipeline holds.
  const tableApplications = statusFilter ? all.filter((a) => a.status === statusFilter) : all

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={`${all.length} application${all.length === 1 ? "" : "s"} tracked.`}
      >
        {view === "table" && all.length > 0 ? (
          <StatusFilter status={statusFilter} view={view} />
        ) : null}
        <ViewToggle view={view} status={statusFilter} />
        <ApplicationSheet
          companies={companies}
          versions={versions}
          trigger={<Button>Add application</Button>}
        />
      </PageHeader>

      {all.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Add the first role you have applied for and it will show up on the board."
        >
          <ApplicationSheet
            companies={companies}
            versions={versions}
            trigger={<Button>Add your first application</Button>}
          />
        </EmptyState>
      ) : view === "table" ? (
        statusFilter && tableApplications.length === 0 ? (
          <EmptyState
            title={`No ${filterStatusLabel(statusFilter).toLowerCase()} applications`}
            description={
              <>Nothing matches this filter. Choose &ldquo;All statuses&rdquo; to see every application.</>
            }
          />
        ) : (
          <ApplicationTable
            applications={tableApplications}
            companies={companies}
            versions={versions}
            openTaskCounts={openTaskCounts}
            taskCounts={taskCounts}
            sort={sort}
            sortHref={(next) => withSort(applicationsHref({ view, status: statusFilter }), next)}
          />
        )
      ) : (
        <ApplicationBoard applications={all} companies={companies} versions={versions} />
      )}
    </div>
  )
}

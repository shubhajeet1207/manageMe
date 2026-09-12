import { redirect } from "next/navigation"
import type { ApplicationStatus } from "@prisma/client"
import { auth } from "@/lib/auth/auth"
import { listApplications } from "@/server/services/application-service"
import { listCompanies } from "@/server/services/company-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_LABELS } from "@/components/status-badge"
import { ApplicationBoard } from "./application-board"
import { ApplicationSheet } from "./application-sheet"
import { ApplicationTable } from "./application-table"
import { parseStatus, parseView } from "./search-params"
import { StatusFilter } from "./status-filter"
import { ViewToggle } from "./view-toggle"

// STATUS_LABELS is keyed by the enum, but any string can be indexed into it at
// runtime; an unexpected key (e.g. an inherited object property like
// "toString") would otherwise return a non-string and crash `.toLowerCase()`.
function filterStatusLabel(status: ApplicationStatus): string {
  const label = STATUS_LABELS[status]
  return typeof label === "string" ? label : "matching"
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const params = await searchParams
  const view = parseView(params.view)
  const statusFilter = parseStatus(params.status)

  const [all, companies] = await Promise.all([
    listApplications(session.user.id),
    listCompanies(session.user.id),
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
        <ApplicationSheet companies={companies} trigger={<Button>Add application</Button>} />
      </PageHeader>

      {all.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Add the first role you have applied for and it will show up on the board."
        >
          <ApplicationSheet
            companies={companies}
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
          <ApplicationTable applications={tableApplications} companies={companies} />
        )
      ) : (
        <ApplicationBoard applications={all} companies={companies} />
      )}
    </div>
  )
}

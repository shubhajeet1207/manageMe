import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listApplications } from "@/server/services/application-service"
import { listCompanies } from "@/server/services/company-service"
import { Button } from "@/components/ui/button"
import { STATUS_LABELS } from "@/components/status-badge"
import { ApplicationBoard } from "./application-board"
import { ApplicationSheet } from "./application-sheet"
import { ApplicationTable } from "./application-table"
import { parseStatus, parseView } from "./search-params"
import { StatusFilter } from "./status-filter"
import { ViewToggle } from "./view-toggle"

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {all.length} application{all.length === 1 ? "" : "s"} tracked.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ApplicationSheet companies={companies} trigger={<Button>Add application</Button>} />
          {view === "table" && all.length > 0 ? (
            <StatusFilter status={statusFilter} view={view} />
          ) : null}
          <ViewToggle view={view} status={statusFilter} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <h2 className="font-medium">No applications yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Add the first role you have applied for and it will show up on the board.
          </p>
          <div className="mt-4">
            <ApplicationSheet
              companies={companies}
              trigger={<Button>Add your first application</Button>}
            />
          </div>
        </div>
      ) : view === "table" ? (
        statusFilter && tableApplications.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center">
            <h2 className="font-medium">
              No {STATUS_LABELS[statusFilter].toLowerCase()} applications
            </h2>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              Nothing matches this filter. Choose &ldquo;All statuses&rdquo; to see every
              application.
            </p>
          </div>
        ) : (
          <ApplicationTable applications={tableApplications} companies={companies} />
        )
      ) : (
        <ApplicationBoard applications={all} companies={companies} />
      )}
    </div>
  )
}

import { redirect } from "next/navigation"
import { ApplicationStatus } from "@prisma/client"
import { auth } from "@/lib/auth/auth"
import { listApplications } from "@/server/services/application-service"
import { listCompanies } from "@/server/services/company-service"
import { Button } from "@/components/ui/button"
import { ApplicationBoard } from "./application-board"
import { ApplicationSheet } from "./application-sheet"
import { ApplicationTable } from "./application-table"
import { ViewToggle } from "./view-toggle"

function parseView(value: string | undefined): "board" | "table" {
  return value === "table" ? "table" : "board"
}

function parseStatus(value: string | undefined): ApplicationStatus | null {
  if (value && value in ApplicationStatus) return value as ApplicationStatus
  return null
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
  const applications = statusFilter ? all.filter((a) => a.status === statusFilter) : all

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {all.length} application{all.length === 1 ? "" : "s"} tracked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ApplicationSheet companies={companies} trigger={<Button>Add application</Button>} />
          <ViewToggle view={view} />
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
        <ApplicationTable applications={applications} companies={companies} />
      ) : (
        <ApplicationBoard applications={applications} />
      )}
    </div>
  )
}

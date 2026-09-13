import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listProjects } from "@/server/services/project-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { ProjectSheet } from "./project-sheet"
import { ProjectStatusFilter } from "./project-status-filter"
import { ProjectTable } from "./project-table"
import { parseProjectStatus } from "./project-status"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { status } = await searchParams
  const filter = parseProjectStatus(status)
  const projects = await listProjects(session.user.id, filter ?? undefined)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Work you are doing, each with its own task list."
      >
        <ProjectStatusFilter status={filter} />
        <ProjectSheet trigger={<Button>New project</Button>} />
      </PageHeader>

      {projects.length === 0 ? (
        <EmptyState
          title={filter ? "No projects with that status" : "No projects yet"}
          description={
            filter
              ? "Nothing here right now. Clear the filter to see the rest."
              : "A project is something you are building or learning — a portfolio site, a certification, a side app. A role you are applying for belongs in Applications instead."
          }
        >
          <ProjectSheet trigger={<Button>Create your first project</Button>} />
        </EmptyState>
      ) : (
        <ProjectTable projects={projects} />
      )}
    </div>
  )
}

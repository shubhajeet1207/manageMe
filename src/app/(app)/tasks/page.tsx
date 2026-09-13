import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { listApplications } from "@/server/services/application-service"
import { listProjects } from "@/server/services/project-service"
import { listTasks } from "@/server/services/task-service"
import { QuickAddTask } from "./quick-add-task"
import { parseTaskFilters } from "./search-params"
import { TaskFilterBar } from "./task-filters"
import { TaskList } from "./task-list"
import { TaskSheet } from "./task-sheet"

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const filters = parseTaskFilters(await searchParams)
  const userId = session.user.id

  const [tasks, projects, applications] = await Promise.all([
    listTasks(userId, filters),
    listProjects(userId),
    listApplications(userId),
  ])

  const options = {
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    applications: applications.map((application) => ({
      id: application.id,
      label: `${application.company.name} · ${application.roleTitle}`,
    })),
  }

  // Resolved from the user's OWN lists, so a filter id that is not theirs names
  // nothing rather than confirming that the row exists.
  const contextLabel =
    options.projects.find((project) => project.id === filters.projectId)?.name ??
    options.applications.find((application) => application.id === filters.applicationId)
      ?.label ??
    null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Everything to do, whatever it is attached to. Sorted by due date."
      >
        <TaskFilterBar filters={filters} contextLabel={contextLabel} />
        <TaskSheet options={options} trigger={<Button>New task</Button>} />
      </PageHeader>

      {/* Above the list and never hidden by the empty state: the affordance
          that makes the state stop being empty should not be behind it. */}
      <QuickAddTask
        projectId={filters.projectId ?? ""}
        applicationId={filters.applicationId ?? ""}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title={filters.status === "DONE" ? "Nothing finished yet" : "No tasks here"}
          description={
            filters.status === "DONE"
              ? "Tasks you tick off collect here, so you can see what a week actually held."
              : "Tasks live here whether they belong to a project, to an application, or to nothing at all. Add one above."
          }
        />
      ) : (
        <TaskList tasks={tasks} options={options} />
      )}
    </div>
  )
}

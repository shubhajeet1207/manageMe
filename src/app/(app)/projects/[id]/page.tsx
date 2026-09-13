import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { listApplications } from "@/server/services/application-service"
import {
  ProjectNotFoundError,
  countProjectTasks,
  getProject,
  listProjects,
} from "@/server/services/project-service"
import { listTasks } from "@/server/services/task-service"
import { QuickAddTask } from "../../tasks/quick-add-task"
import { TaskList } from "../../tasks/task-list"
import { DeleteProjectDialog } from "../delete-project-dialog"
import { ProjectSheet } from "../project-sheet"
import { ProjectStatusBadge } from "../project-status"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params
  const userId = session.user.id

  // A project that does not exist and one that is not yours render the same
  // page, because they are the same answer (§8.2).
  let project
  try {
    project = await getProject(userId, id)
  } catch (error) {
    if (error instanceof ProjectNotFoundError) notFound()
    throw error
  }

  const [tasks, taskCount, projects, applications] = await Promise.all([
    listTasks(userId, { projectId: id }),
    countProjectTasks(userId, id),
    listProjects(userId),
    listApplications(userId),
  ])

  const options = {
    projects: projects.map((entry) => ({ id: entry.id, name: entry.name })),
    applications: applications.map((application) => ({
      id: application.id,
      label: `${application.company.name} · ${application.roleTitle}`,
    })),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            {project.url ? (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {project.url.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
          </span>
        }
      >
        <ProjectSheet
          project={project}
          trigger={<Button variant="outline">Edit</Button>}
        />
        <DeleteProjectDialog
          projectId={project.id}
          projectName={project.name}
          taskCount={taskCount}
          redirectTo="/projects"
        />
      </PageHeader>

      {project.description ? (
        <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-wrap">
          {project.description}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Tasks</h2>
        <QuickAddTask projectId={project.id} />
        {tasks.length === 0 ? (
          <EmptyState
            title="Nothing to do yet"
            description="Add the next thing this project needs. Tasks added here belong to it."
          />
        ) : (
          <TaskList tasks={tasks} options={options} hideContext />
        )}
      </section>
    </div>
  )
}

import { ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ResumeProject } from "@prisma/client"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { ProjectSheet } from "./project-sheet"

export function ProjectList({
  resumeId,
  projects,
}: {
  resumeId: string
  projects: ResumeProject[]
}) {
  return (
    <ul className="border-card-border bg-card divide-border divide-y rounded-lg border">
      {projects.map((project) => (
        <li
          key={project.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5"
        >
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{project.name}</p>
            {project.description ? (
              <p className="text-muted-foreground max-w-2xl text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {project.description}
              </p>
            ) : null}
            {project.url ? (
              <a
                href={project.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${project.name}`}
                className="text-muted-foreground inline-flex max-w-full items-baseline gap-1 text-sm underline underline-offset-2 [overflow-wrap:anywhere] hover:text-foreground"
              >
                <ExternalLinkIcon className="size-3 shrink-0 self-center" />
                {project.url}
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center">
            <ProjectSheet
              resumeId={resumeId}
              project={project}
              trigger={
                <Button variant="ghost" size="sm" aria-label={`Edit ${project.name}`}>
                  Edit
                </Button>
              }
            />
            <DeleteProjectDialog projectId={project.id} projectName={project.name} />
          </div>
        </li>
      ))}
    </ul>
  )
}

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ProjectWithOpenTasks } from "@/server/repositories/project-repository"
import { formatDate } from "../resumes/format"
import { tasksHref } from "../tasks/search-params"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { ProjectSheet } from "./project-sheet"
import { ProjectStatusBadge } from "./project-status"

export function ProjectTable({ projects }: { projects: ProjectWithOpenTasks[] }) {
  return (
    // The same single-scroller frame as the companies table: the inner
    // container's overflow is neutralised so the bordered frame is the one
    // thing that scrolls, and below lg the table holds a readable strip.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[720px] lg:min-w-[560px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Open tasks</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                <Link href={`/projects/${project.id}`} className="hover:underline">
                  {project.name}
                </Link>
              </TableCell>
              <TableCell>
                <ProjectStatusBadge status={project.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {project.openTaskCount > 0 ? (
                  <Link
                    href={tasksHref({ projectId: project.id })}
                    className="hover:underline"
                  >
                    {project.openTaskCount}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatDate(project.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <ProjectSheet
                  project={project}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteProjectDialog
                  projectId={project.id}
                  projectName={project.name}
                  taskCount={project.taskCount}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

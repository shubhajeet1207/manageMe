"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { TaskWithContext } from "@/server/repositories/task-repository"
import { setTaskDoneAction } from "./actions"
import { DeleteTaskDialog } from "./delete-task-dialog"
import { bucketFor, formatDueDate, toDateInputValue } from "./due-date"
import { TASK_STATUS_LABELS } from "./search-params"
import { TaskSheet, type TaskOwnerOptions } from "./task-sheet"

const DUE_CLASSES: Record<string, string> = {
  OVERDUE: "text-destructive font-medium",
  TODAY: "text-foreground font-medium",
  WEEK: "text-muted-foreground",
  LATER: "text-muted-foreground",
  NONE: "text-muted-foreground",
}

export function TaskRow({
  task,
  options,
  today,
  hideContext = false,
}: {
  task: TaskWithContext
  options: TaskOwnerOptions
  /** The READER's today, and null until the client has mounted — the server has
   *  no business deciding which day "overdue" is measured from (§7.5). */
  today: Date | null
  hideContext?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const done = task.status === "DONE"

  function onToggle(checked: boolean) {
    startTransition(async () => {
      const result = await setTaskDoneAction({ id: task.id, done: checked })
      if (result.success) {
        router.refresh()
        return
      }
      toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  const bucket = today ? bucketFor(task.dueDate, today) : "LATER"

  return (
    <li className="border-card-border bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5">
      <Checkbox
        checked={done}
        disabled={isPending}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm leading-5 [overflow-wrap:anywhere]",
            done && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </p>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {task.dueDate ? (
            <time dateTime={toDateInputValue(task.dueDate)} className={DUE_CLASSES[bucket]}>
              {formatDueDate(task.dueDate)}
            </time>
          ) : null}

          {task.status === "IN_PROGRESS" ? (
            <span className="text-foreground font-medium">
              {TASK_STATUS_LABELS.IN_PROGRESS}
            </span>
          ) : null}

          {hideContext ? null : (
            <>
              {task.project ? (
                <Link
                  href={`/projects/${task.project.id}`}
                  className="border-card-border bg-well max-w-full truncate rounded-full border px-2 py-0.5 hover:underline"
                >
                  {task.project.name}
                </Link>
              ) : null}
              {task.application ? (
                <Link
                  href={`/companies/${task.application.companyId}`}
                  className="border-card-border bg-well max-w-full truncate rounded-full border px-2 py-0.5 hover:underline"
                >
                  {task.application.company.name} · {task.application.roleTitle}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${task.title}`}>
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing ? (
        <TaskSheet
          task={task}
          options={options}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}

      <DeleteTaskDialog
        taskId={task.id}
        taskTitle={task.title}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </li>
  )
}

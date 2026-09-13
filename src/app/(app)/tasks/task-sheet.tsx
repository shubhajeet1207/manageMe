"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { TaskStatus } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import type { TaskWithContext } from "@/server/repositories/task-repository"
import { triageQuickDropToTaskAction } from "../quickdrop/actions"
import { createTaskAction, updateTaskAction } from "./actions"
import { toDateInputValue } from "./due-date"
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER } from "./search-params"

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

// Radix Select forbids an empty item value, so a sentinel stands in for "None"
// and is translated back to "" on submit — which the schema turns into
// undefined, which clears through `?? null` (§12.1).
const NONE = "none"

export type TaskOwnerOptions = {
  projects: { id: string; name: string }[]
  applications: { id: string; label: string }[]
}

type FormValues = {
  title: string
  status: TaskStatus
  dueDate: string
  notes: string
}

export function TaskSheet({
  task,
  options,
  defaultTitle = "",
  defaultProjectId = "",
  defaultApplicationId = "",
  quickDropItemId,
  lockOwner = false,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  task?: TaskWithContext
  options: TaskOwnerOptions
  defaultTitle?: string
  defaultProjectId?: string
  defaultApplicationId?: string
  /** When present the create half is a TRIAGE: the task is created and the
   *  inbox row deleted in one transaction, so a failed create leaves the
   *  capture where it was. */
  quickDropItemId?: string
  /** A task created from a project's own page belongs to that project; the
   *  selects are hidden rather than shown pre-set and editable. */
  lockOwner?: boolean
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId)
  const [applicationId, setApplicationId] = useState(
    task?.applicationId ?? defaultApplicationId
  )
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const isEdit = Boolean(task)

  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const blank: FormValues = {
    title: defaultTitle,
    status: "TODO",
    dueDate: "",
    notes: "",
  }

  const form = useForm<FormValues>({
    defaultValues: task
      ? {
          title: task.title,
          status: task.status,
          dueDate: toDateInputValue(task.dueDate),
          notes: task.notes ?? "",
        }
      : blank,
  })

  function onSubmit(values: FormValues) {
    setOwnerError(null)
    startTransition(async () => {
      const payload = { ...values, projectId, applicationId }
      const result = isEdit
        ? await updateTaskAction({ ...payload, id: task!.id })
        : quickDropItemId
          ? await triageQuickDropToTaskAction({ ...payload, quickDropItemId })
          : await createTaskAction(payload)

      if (result.success) {
        setOpen(false)
        form.reset(isEdit ? values : blank)
        if (!isEdit) {
          setProjectId(defaultProjectId)
          setApplicationId(defaultApplicationId)
        }
        router.refresh()
        toast.success(isEdit ? "Task updated" : "Task created")
        onSaved?.()
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (!messages?.[0]) continue
          if (field === "projectId" || field === "applicationId") setOwnerError(messages[0])
          else form.setError(field as keyof FormValues, { message: messages[0] })
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  const errors = form.formState.errors

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit task" : "New task"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this task."
              : "Something to do — on its own, on a project, or about an application."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="Send follow-up to Acme"
              {...form.register("title", { required: "Title is required" })}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: string) => form.setValue("status", value as TaskStatus)}
            >
              <SelectTrigger aria-label="Status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due-date">Due date</Label>
            {/* A day, not an instant: the native control emits YYYY-MM-DD and
                the schema parses exactly that (§7.5). */}
            <Input id="task-due-date" type="date" {...form.register("dueDate")} />
            <FieldError message={errors.dueDate?.message} />
          </div>

          {lockOwner ? null : (
            <>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={projectId === "" ? NONE : projectId}
                  onValueChange={(value: string) => setProjectId(value === NONE ? "" : value)}
                >
                  <SelectTrigger aria-label="Project" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No project</SelectItem>
                    {options.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Application</Label>
                <Select
                  value={applicationId === "" ? NONE : applicationId}
                  onValueChange={(value: string) =>
                    setApplicationId(value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Application" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No application</SelectItem>
                    {options.applications.map((application) => (
                      <SelectItem key={application.id} value={application.id}>
                        {application.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {ownerError ? (
            <p role="alert" className="text-destructive text-sm">
              {ownerError}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" rows={4} {...form.register("notes")} />
            <FieldError message={errors.notes?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

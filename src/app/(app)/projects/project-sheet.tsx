"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { ProjectStatus } from "@prisma/client"
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
import type { Project } from "@prisma/client"
import { triageQuickDropToProjectAction } from "../quickdrop/actions"
import { createProjectAction, updateProjectAction } from "./actions"
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "./project-status"

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

type FormValues = {
  name: string
  status: ProjectStatus
  description: string
  url: string
}

export function ProjectSheet({
  project,
  defaultName = "",
  defaultStatus = "ACTIVE",
  quickDropItemId,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  project?: Project
  defaultName?: string
  defaultStatus?: ProjectStatus
  /** When present the create half is a TRIAGE: one transaction creates the
   *  project and deletes the inbox row. */
  quickDropItemId?: string
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(project)

  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const blank: FormValues = {
    name: defaultName,
    status: defaultStatus,
    description: "",
    url: "",
  }

  const form = useForm<FormValues>({
    defaultValues: project
      ? {
          name: project.name,
          status: project.status,
          description: project.description ?? "",
          url: project.url ?? "",
        }
      : blank,
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateProjectAction({ ...values, id: project!.id })
        : quickDropItemId
          ? await triageQuickDropToProjectAction({ ...values, quickDropItemId })
          : await createProjectAction(values)

      if (result.success) {
        setOpen(false)
        form.reset(isEdit ? values : blank)
        router.refresh()
        toast.success(isEdit ? "Project updated" : "Project created")
        onSaved?.()
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) form.setError(field as keyof FormValues, { message: messages[0] })
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
          <SheetTitle>{isEdit ? "Edit project" : "New project"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this project's details."
              : "A piece of work you are doing — not a role you are applying for."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="Portfolio site"
              {...form.register("name", { required: "Name is required" })}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: string) => form.setValue("status", value as ProjectStatus)}
            >
              <SelectTrigger aria-label="Status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" rows={4} {...form.register("description")} />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-url">Link</Label>
            <Input
              id="project-url"
              placeholder="https://github.com/you/portfolio"
              {...form.register("url")}
            />
            <FieldError message={errors.url?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

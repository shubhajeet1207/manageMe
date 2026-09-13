"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  createResumeProjectSchema,
  type CreateResumeProjectInput,
} from "@/server/validators/resume-schemas"
import type { ResumeProject } from "@prisma/client"
import { createResumeProjectAction, updateResumeProjectAction } from "../actions"

export function ProjectSheet({
  resumeId,
  project,
  trigger,
}: {
  resumeId: string
  project?: Pick<ResumeProject, "id" | "name" | "description" | "url">
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(project)

  const emptyValues: CreateResumeProjectInput = {
    resumeId,
    name: "",
    description: "",
    url: "",
  }

  const form = useForm<CreateResumeProjectInput>({
    resolver: zodResolver(createResumeProjectSchema),
    defaultValues: {
      resumeId,
      name: project?.name ?? "",
      description: project?.description ?? "",
      url: project?.url ?? "",
    },
  })

  function onSubmit(values: CreateResumeProjectInput) {
    startTransition(async () => {
      // The update payload carries no resumeId: a project cannot move between
      // slots, so the schema does not accept one.
      const result = isEdit
        ? await updateResumeProjectAction({
            id: project!.id,
            name: values.name,
            description: values.description,
            url: values.url,
          })
        : await createResumeProjectAction(values)

      if (result.success) {
        setOpen(false)
        // Reset to what was saved, with the cleared fields as empty strings
        // rather than the undefined the schema produced, so the inputs stay
        // controlled when the sheet reopens.
        form.reset(
          isEdit
            ? {
                resumeId,
                name: values.name,
                description: values.description ?? "",
                url: values.url ?? "",
              }
            : emptyValues
        )
        router.refresh()
        toast.success(isEdit ? "Project updated" : "Project added")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (!messages?.[0]) continue
          // `resumeId` and `id` have no input to attach an error to.
          if (field === "resumeId" || field === "id") {
            toast.error(messages[0])
            continue
          }
          form.setError(field as keyof CreateResumeProjectInput, { message: messages[0] })
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit project" : "Add project"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Emptying the description or the link clears it."
              : "One piece of work this resume leads with — what it was, and where it can be looked at."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Billing-service rebuild"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Moved 40 services off a shared Postgres without downtime."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    What it was and what it changed, in the words you would say out loud.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://github.com/you/billing-service"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>Optional. http or https only.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add project"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}

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
import { createResumeSchema, type CreateResumeInput } from "@/server/validators/resume-schemas"
import type { Resume } from "@prisma/client"
import { createResumeAction, updateResumeAction } from "./actions"

export function ResumeSheet({
  resume,
  trigger,
}: {
  resume?: Pick<Resume, "id" | "name" | "notes">
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(resume)

  const form = useForm<CreateResumeInput>({
    resolver: zodResolver(createResumeSchema),
    defaultValues: {
      name: resume?.name ?? "",
      notes: resume?.notes ?? "",
    },
  })

  function onSubmit(values: CreateResumeInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateResumeAction({ ...values, id: resume!.id })
        : await createResumeAction(values)

      if (result.success) {
        setOpen(false)
        form.reset(isEdit ? values : { name: "", notes: "" })
        router.refresh()
        toast.success(isEdit ? "Resume updated" : "Resume added")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            form.setError(field as keyof CreateResumeInput, { message: messages[0] })
          }
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
          <SheetTitle>{isEdit ? "Edit resume" : "Add resume"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Rename this slot or update its notes. Its versions are untouched."
              : "A named slot that holds every version of one resume."}
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
                    <Input placeholder="Backend SWE" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    What this resume is for, not the filename.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add resume"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}

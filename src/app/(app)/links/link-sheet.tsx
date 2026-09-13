"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { TagInput } from "@/components/tag-input"
import { MAX_LINK_TAGS, MAX_LINK_TAG_LENGTH } from "@/server/validators/link-schemas"
import type { Link } from "@prisma/client"
import { triageQuickDropToLinkAction } from "../quickdrop/actions"
import { createLinkAction, updateLinkAction } from "./actions"

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

/** A convenience only. The server has no such default and rejects a blank
 *  title, exactly as a resume version label is rejected. */
function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

type FormValues = {
  url: string
  title: string
  description: string
}

export function LinkSheet({
  link,
  defaultUrl = "",
  quickDropItemId,
  suggestions = [],
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  link?: Link
  defaultUrl?: string
  /** When present the create half is a TRIAGE: one transaction creates the
   *  link and deletes the inbox row. */
  quickDropItemId?: string
  suggestions?: string[]
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tags, setTags] = useState<string[]>(link?.tags ?? [])
  const [tagError, setTagError] = useState<string | null>(null)
  const isEdit = Boolean(link)
  // The host prefill follows the URL field while the title is untouched, and
  // stops the moment the user types one. Doing it on BLUR instead put the host
  // into the field at the exact moment focus arrived there, so the next
  // keystroke landed after it and the title read "example.comSalary guide".
  const [titleEdited, setTitleEdited] = useState(Boolean(link) || defaultUrl !== "")

  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const blank: FormValues = { url: defaultUrl, title: "", description: "" }

  const form = useForm<FormValues>({
    defaultValues: link
      ? { url: link.url, title: link.title, description: link.description ?? "" }
      : blank,
  })

  function onSubmit(values: FormValues) {
    setTagError(null)
    startTransition(async () => {
      const payload = { ...values, tags }
      const result = isEdit
        ? await updateLinkAction({ ...payload, id: link!.id })
        : quickDropItemId
          ? await triageQuickDropToLinkAction({ ...payload, quickDropItemId })
          : await createLinkAction(payload)

      if (result.success) {
        setOpen(false)
        form.reset(isEdit ? values : blank)
        if (!isEdit) setTags([])
        router.refresh()
        toast.success(isEdit ? "Link updated" : "Link saved")
        onSaved?.()
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (!messages?.[0]) continue
          if (field === "tags") setTagError(messages[0])
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
          <SheetTitle>{isEdit ? "Edit link" : "Save a link"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this link."
              : "A URL worth keeping — a salary guide, an interview-prep article, a recruiter's scheduling page."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              placeholder="https://example.com/salary-guide"
              {...form.register("url", {
                required: "Enter a valid URL",
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (titleEdited) return
                  form.setValue("title", hostOf(event.target.value))
                },
              })}
            />
            <FieldError message={errors.url?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-title">Title</Label>
            <Input
              id="link-title"
              placeholder="Salary guide"
              {...form.register("title", {
                required: "Title is required",
                onChange: () => setTitleEdited(true),
              })}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-description">Description</Label>
            <Textarea id="link-description" rows={3} {...form.register("description")} />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-tags">Tags</Label>
            <TagInput
              id="link-tags"
              value={tags}
              onChange={setTags}
              maxTags={MAX_LINK_TAGS}
              maxLength={MAX_LINK_TAG_LENGTH}
              suggestions={suggestions}
              placeholder="research"
              disabled={isPending}
            />
            <FieldError message={tagError ?? undefined} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Save link"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

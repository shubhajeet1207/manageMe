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
import { MAX_SECRET_LENGTH } from "@/server/validators/credential-schemas"
import type { CredentialSummary } from "@/server/repositories/credential-repository"
import { createCredentialAction, updateCredentialAction } from "./actions"

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

type FormValues = {
  label: string
  siteUrl: string
  username: string
  secret: string
  notes: string
}

const BLANK: FormValues = { label: "", siteUrl: "", username: "", secret: "", notes: "" }

export function CredentialSheet({
  credential,
  trigger,
}: {
  credential?: CredentialSummary
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(credential)

  // The password field renders EMPTY on an edit, never pre-filled with the
  // stored value — there is no per-record surface that carries a plaintext, and
  // an empty field means "leave it alone", which is also the safest default.
  const form = useForm<FormValues>({
    defaultValues: credential
      ? {
          label: credential.label,
          siteUrl: credential.siteUrl ?? "",
          username: credential.username ?? "",
          secret: "",
          notes: credential.notes ?? "",
        }
      : BLANK,
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCredentialAction({ ...values, id: credential!.id })
        : await createCredentialAction(values)

      if (result.success) {
        setOpen(false)
        // The secret is never carried back into the form's state.
        form.reset(isEdit ? { ...values, secret: "" } : BLANK)
        router.refresh()
        toast.success(isEdit ? "Credential updated" : "Credential saved")
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
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit credential" : "Save a credential"}</SheetTitle>
          <SheetDescription>
            For your own low-stakes portal logins. Not for banking, work accounts, or anything
            shared with another person — see the note below the form.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="credential-label">Label</Label>
            <Input
              id="credential-label"
              placeholder="Workday — Acme"
              {...form.register("label", { required: "Label is required" })}
            />
            <FieldError message={errors.label?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-site">Site</Label>
            <Input
              id="credential-site"
              placeholder="https://acme.wd1.myworkdayjobs.com"
              {...form.register("siteUrl")}
            />
            <FieldError message={errors.siteUrl?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-username">Username</Label>
            <Input
              id="credential-username"
              autoComplete="off"
              {...form.register("username")}
            />
            <p className="text-muted-foreground text-xs">
              Stored as plain text, so the list can identify the record by it.
            </p>
            <FieldError message={errors.username?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-secret">Password</Label>
            <Input
              id="credential-secret"
              type="password"
              // So the browser's own manager does not offer to save a third
              // party's credential into the profile as though it were ours.
              autoComplete="new-password"
              maxLength={MAX_SECRET_LENGTH}
              placeholder={isEdit ? "Leave empty to keep the current password" : ""}
              {...form.register("secret", {
                required: isEdit ? false : "Password is required",
              })}
            />
            <p className="text-muted-foreground text-xs">
              Encrypted with AES-256-GCM before it is stored, and shown again only through
              Reveal, which asks for your account password.
            </p>
            <FieldError message={errors.secret?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-notes">Notes</Label>
            <Textarea id="credential-notes" rows={3} {...form.register("notes")} />
            <p className="text-muted-foreground text-xs">
              Plain text. Not a second password field.
            </p>
            <FieldError message={errors.notes?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Save credential"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

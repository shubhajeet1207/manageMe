"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CompanySelect, NEW_COMPANY, NO_COMPANY } from "@/components/company-select"
import { TagInput } from "@/components/tag-input"
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/server/files/content-types"
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_DESCRIPTION_LENGTH,
  MAX_DOCUMENT_TAGS,
  MAX_DOCUMENT_TITLE_LENGTH,
  MAX_TAG_LENGTH,
  UNSUPPORTED_FILE_MESSAGE,
} from "@/server/validators/document-schemas"
import type { DocumentWithCompany } from "@/server/repositories/document-repository"
import type { Company } from "@prisma/client"
import { createDocumentAction, updateDocumentAction } from "./actions"

/** The seed set behind the tag field when the vault has no tags of its own —
 *  a client constant, not a table. An empty vault's tag field is otherwise a
 *  blank text box with no hint what belongs in it. */
const SEED_TAGS = ["offer letter", "payslip", "certificate", "ID proof", "contract"]

const SUGGESTED_TAG_COUNT = 5

const ALLOWED_TYPES = DOCUMENT_ACCEPT.split(",")

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").slice(0, MAX_DOCUMENT_TITLE_LENGTH)
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

type ErrorField = "file" | "title" | "tags" | "companyId" | "expiresOn" | "description"

/** A list, not an object keyed by field: `"toString" in { file: 1 }` is true,
 *  and membership tests that walk the prototype chain are a bug this codebase
 *  has already shipped once. */
const ERROR_FIELDS: ErrorField[] = [
  "file",
  "title",
  "tags",
  "companyId",
  "expiresOn",
  "description",
]

type Errors = Partial<Record<ErrorField, string>>

export function DocumentSheet({
  companies,
  popularTags = [],
  document,
  trigger,
}: {
  companies: Pick<Company, "id" | "name">[]
  /** The user's most-used tags, from the facet query. */
  popularTags?: string[]
  document?: DocumentWithCompany
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const isEdit = Boolean(document)

  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(document?.title ?? "")
  const [titleEdited, setTitleEdited] = useState(false)
  const [description, setDescription] = useState(document?.description ?? "")
  const [tags, setTags] = useState<string[]>(document?.tags ?? [])
  const [companyId, setCompanyId] = useState(document?.companyId ?? "")
  const [expiresOn, setExpiresOn] = useState(
    document?.expiresOn ? document.expiresOn.toISOString().slice(0, 10) : ""
  )
  const [errors, setErrors] = useState<Errors>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const suggestions = (popularTags.length > 0 ? popularTags : SEED_TAGS).slice(
    0,
    SUGGESTED_TAG_COUNT
  )

  function reset() {
    setTitle(document?.title ?? "")
    setTitleEdited(false)
    setDescription(document?.description ?? "")
    setTags(document?.tags ?? [])
    setCompanyId(document?.companyId ?? "")
    setExpiresOn(document?.expiresOn ? document.expiresOn.toISOString().slice(0, 10) : "")
    setErrors({})
    if (fileRef.current) fileRef.current.value = ""
  }

  function applyResult(
    result: { success: true } | { success: false; fieldErrors?: Record<string, string[] | undefined>; formError?: string },
    successMessage: string
  ) {
    if (result.success) {
      setOpen(false)
      reset()
      router.refresh()
      toast.success(successMessage)
      return
    }
    const next: Errors = {}
    for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (!messages?.[0]) continue
      const known = ERROR_FIELDS.find((candidate) => candidate === field)
      if (known) next[known] = messages[0]
      else toast.error(messages[0])
    }
    setErrors(next)
    if (result.formError) toast.error(result.formError)
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})

    if (title.trim() === "") {
      setErrors({ title: "Title is required" })
      return
    }

    // "" rather than the sentinel: the schema turns an empty string into
    // undefined, so clearing the select saves as null instead of as "".
    const linkedCompanyId = companyId === NO_COMPANY || companyId === NEW_COMPANY ? "" : companyId

    if (isEdit) {
      startTransition(async () => {
        const result = await updateDocumentAction({
          id: document!.id,
          title,
          description,
          tags,
          companyId: linkedCompanyId,
          expiresOn,
        })
        applyResult(result, "Document updated")
      })
      return
    }

    const file = fileRef.current?.files?.[0]
    // Client-side checks are UX only — they catch the honest mistake without a
    // round trip. The server re-checks all of this and reads the bytes, which
    // is the check a renamed file cannot pass.
    if (!file) {
      setErrors({ file: "Choose a file" })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors({ file: `This file is larger than ${MAX_UPLOAD_MB}MB` })
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrors({ file: UNSUPPORTED_FILE_MESSAGE })
      return
    }

    const formData = new FormData()
    formData.set("file", file)
    formData.set("title", title)
    formData.set("description", description)
    for (const tag of tags) formData.append("tags", tag)
    formData.set("companyId", linkedCompanyId)
    formData.set("expiresOn", expiresOn)

    startTransition(async () => {
      const result = await createDocumentAction(formData)
      applyResult(result, "Document uploaded")
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit document" : "Upload document"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The file itself can’t be changed. Delete the document and upload again to replace it."
              : "Offer letters, payslips, certificates, ID proofs — filed with tags so you can find one later."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-4 px-4 pb-6">
          {isEdit ? null : (
            <div className="space-y-2">
              <Label htmlFor="document-file">File</Label>
              <Input
                id="document-file"
                name="file"
                type="file"
                accept={DOCUMENT_ACCEPT}
                ref={fileRef}
                aria-invalid={errors.file ? true : undefined}
                onChange={(event) => {
                  setErrors((current) => ({ ...current, file: undefined }))
                  const chosen = event.target.files?.[0]
                  if (chosen && !titleEdited) setTitle(titleFromFilename(chosen.name))
                }}
              />
              <p className="text-muted-foreground text-sm">
                PDF, PNG, JPEG or WebP, up to {MAX_UPLOAD_MB}MB. Word files and SVGs
                aren’t accepted — export to PDF.
              </p>
              <FieldError message={errors.file} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="document-title">Title</Label>
            <Input
              id="document-title"
              value={title}
              maxLength={MAX_DOCUMENT_TITLE_LENGTH}
              placeholder="Acme offer letter"
              aria-invalid={errors.title ? true : undefined}
              onChange={(event) => {
                setTitle(event.target.value)
                setTitleEdited(true)
                setErrors((current) => ({ ...current, title: undefined }))
              }}
            />
            <FieldError message={errors.title} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-tags">Tags</Label>
            <TagInput
              id="document-tags"
              value={tags}
              onChange={setTags}
              maxTags={MAX_DOCUMENT_TAGS}
              maxLength={MAX_TAG_LENGTH}
              suggestions={suggestions}
              placeholder="payslip"
              disabled={isPending}
            />
            <FieldError message={errors.tags} />
          </div>

          <div className="space-y-2">
            <Label>Company</Label>
            <CompanySelect
              companies={companies}
              value={companyId}
              newName=""
              allowNone
              allowNew={false}
              triggerClassName="w-full"
              onChangeValue={(value) => {
                setCompanyId(value === NO_COMPANY ? "" : value)
                setErrors((current) => ({ ...current, companyId: undefined }))
              }}
              onChangeNewName={() => {}}
            />
            <FieldError message={errors.companyId} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-expires-on">Expires on</Label>
            <Input
              id="document-expires-on"
              type="date"
              value={expiresOn}
              aria-invalid={errors.expiresOn ? true : undefined}
              onChange={(event) => {
                setExpiresOn(event.target.value)
                setErrors((current) => ({ ...current, expiresOn: undefined }))
              }}
            />
            <p className="text-muted-foreground text-sm">
              Optional. Shows a badge when it is close or past — there are no reminders.
            </p>
            <FieldError message={errors.expiresOn} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-description">Description</Label>
            <Textarea
              id="document-description"
              rows={3}
              value={description}
              maxLength={MAX_DOCUMENT_DESCRIPTION_LENGTH}
              aria-invalid={errors.description ? true : undefined}
              onChange={(event) => {
                setDescription(event.target.value)
                setErrors((current) => ({ ...current, description: undefined }))
              }}
            />
            <FieldError message={errors.description} />
          </div>

          {/* No progress bar: a Server Action exposes no upload progress, and a
              bar that sits at 0 and jumps to 100 is a fake UI. */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending
              ? isEdit
                ? "Saving…"
                : "Uploading…"
              : isEdit
                ? "Save changes"
                : "Upload document"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

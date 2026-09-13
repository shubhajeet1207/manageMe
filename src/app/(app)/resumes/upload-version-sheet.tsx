"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { MAX_UPLOAD_BYTES, PDF_CONTENT_TYPE } from "@/server/files/pdf"
import { uploadResumeVersionAction } from "./actions"

/** The same constant the server validates against, imported rather than
 *  restated so the two cannot drift. */
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024

function labelFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").slice(0, 100)
}

export function UploadVersionSheet({
  resumeId,
  trigger,
}: {
  resumeId: string
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState("")
  const [labelEdited, setLabelEdited] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setLabel("")
    setLabelEdited(false)
    setFileError(null)
    setLabelError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFileError(null)
    setLabelError(null)

    const file = fileRef.current?.files?.[0]
    // Client-side checks are UX only — they catch the honest mistake without a
    // round trip. The server re-checks all of this and reads the bytes, which
    // is the check a renamed file cannot pass.
    if (!file) {
      setFileError("Choose a file")
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError(`This file is larger than ${MAX_UPLOAD_MB}MB`)
      return
    }
    if (file.type !== PDF_CONTENT_TYPE) {
      setFileError("Only PDF files are supported")
      return
    }
    if (label.trim() === "") {
      setLabelError("Label is required")
      return
    }

    const formData = new FormData()
    formData.set("resumeId", resumeId)
    formData.set("label", label)
    formData.set("file", file)

    startTransition(async () => {
      const result = await uploadResumeVersionAction(formData)
      if (result.success) {
        setOpen(false)
        reset()
        router.refresh()
        toast.success("Version uploaded")
        return
      }
      if (result.fieldErrors) {
        if (result.fieldErrors.file?.[0]) setFileError(result.fieldErrors.file[0])
        if (result.fieldErrors.label?.[0]) setLabelError(result.fieldErrors.label[0])
        if (result.fieldErrors.resumeId?.[0]) toast.error(result.fieldErrors.resumeId[0])
      }
      if (result.formError) toast.error(result.formError)
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
          <SheetTitle>Upload new version</SheetTitle>
          <SheetDescription>
            This adds a version. Nothing is overwritten, so every file you have
            sent stays openable.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="resume-file">File</Label>
            <Input
              id="resume-file"
              name="file"
              type="file"
              accept="application/pdf"
              ref={fileRef}
              aria-invalid={fileError ? true : undefined}
              onChange={(event) => {
                setFileError(null)
                const chosen = event.target.files?.[0]
                if (chosen && !labelEdited) setLabel(labelFromFilename(chosen.name))
              }}
            />
            <p className="text-muted-foreground text-sm">
              PDF only, up to {MAX_UPLOAD_MB}MB.
            </p>
            {fileError ? (
              <p role="alert" className="text-destructive text-sm">
                {fileError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume-version-label">Label</Label>
            <Input
              id="resume-version-label"
              value={label}
              maxLength={100}
              placeholder="March rewrite"
              aria-invalid={labelError ? true : undefined}
              onChange={(event) => {
                setLabel(event.target.value)
                setLabelEdited(true)
                setLabelError(null)
              }}
            />
            {labelError ? (
              <p role="alert" className="text-destructive text-sm">
                {labelError}
              </p>
            ) : null}
          </div>

          {/* No progress bar: a Server Action exposes no upload progress, and a
              bar that sits at 0 and jumps to 100 is a fake UI. */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Uploading…" : "Upload version"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

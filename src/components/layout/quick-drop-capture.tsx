"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { InboxIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { captureQuickDropAction } from "@/app/(app)/quickdrop/actions"

/**
 * Capture from anywhere in the app: one field, one submit, no category, no
 * title, no due date. On success the sheet STAYS OPEN with the field cleared
 * and refocused, because the whole value of the feature is that a second
 * capture is immediate.
 *
 * No global keyboard shortcut this phase (§8.5): a global key handler has to
 * coexist with every text input in the app and with the global search a later
 * phase will want, and the two bindings should be chosen together.
 */
export function QuickDropCapture() {
  const router = useRouter()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = content.trim()
    if (next === "") return

    setError(null)
    startTransition(async () => {
      const result = await captureQuickDropAction({ content: next })
      if (result.success) {
        setContent("")
        fieldRef.current?.focus()
        router.refresh()
        toast.success("Dropped into your inbox")
        return
      }
      const fieldError = result.fieldErrors?.content?.[0]
      if (fieldError) setError(fieldError)
      else toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Quick drop">
            <InboxIcon />
            <span className="hidden sm:inline">Drop</span>
          </Button>
        }
      />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>QuickDrop</SheetTitle>
          <SheetDescription>
            Paste a link or type a line. Sort it out later from the inbox.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-3 px-4 pb-6">
          <Textarea
            ref={fieldRef}
            autoFocus
            rows={4}
            value={content}
            aria-label="What do you want to remember?"
            aria-invalid={error ? true : undefined}
            placeholder="https://jobs.example/posting — or “ask Priya about the referral”"
            onChange={(event) => {
              setContent(event.target.value)
              setError(null)
            }}
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Dropping…" : "Drop it"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

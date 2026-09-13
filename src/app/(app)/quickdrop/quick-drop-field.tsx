"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { captureQuickDropAction } from "./actions"

/**
 * The inbox's own capture field. The topbar button opens the same action in a
 * sheet; here the field is already on screen, because the page you go to in
 * order to empty the inbox is also the page you refill it from.
 */
export function QuickDropField() {
  const router = useRouter()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
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
        return
      }
      const fieldError = result.fieldErrors?.content?.[0]
      if (fieldError) setError(fieldError)
      else toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-start gap-2">
        <Textarea
          ref={fieldRef}
          rows={2}
          value={content}
          aria-label="Drop something into your inbox"
          aria-invalid={error ? true : undefined}
          placeholder="Paste a link or type a line"
          className="min-w-0 flex-1"
          onChange={(event) => {
            setContent(event.target.value)
            setError(null)
          }}
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Dropping…" : "Drop"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  )
}

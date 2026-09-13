"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { quickAddTaskAction } from "./actions"

/**
 * One field, and Enter creates a TODO task with that title and nothing else —
 * the same capture-speed argument as QuickDrop, applied where the user already
 * knows the thing is a task. The field clears and keeps focus, so a run of
 * three tasks costs three sentences.
 */
export function QuickAddTask({
  projectId = "",
  applicationId = "",
}: {
  projectId?: string
  applicationId?: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = title.trim()
    if (next === "") return

    setError(null)
    startTransition(async () => {
      const result = await quickAddTaskAction({ title: next, projectId, applicationId })
      if (result.success) {
        setTitle("")
        inputRef.current?.focus()
        router.refresh()
        return
      }
      const fieldError = result.fieldErrors?.title?.[0] ?? result.fieldErrors?.projectId?.[0]
      if (fieldError) setError(fieldError)
      else toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={title}
          maxLength={200}
          aria-label="Add a task"
          aria-invalid={error ? true : undefined}
          placeholder="Add a task and press Enter"
          className="min-w-0 flex-1"
          onChange={(event) => {
            setTitle(event.target.value)
            setError(null)
          }}
        />
        {/* Never disabled while a write is in flight: a disabled default button
            takes implicit form submission with it, so Enter would silently do
            nothing for exactly as long as the previous task was saving. */}
        <Button type="submit" variant="outline">
          {isPending ? "Adding…" : "Add"}
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

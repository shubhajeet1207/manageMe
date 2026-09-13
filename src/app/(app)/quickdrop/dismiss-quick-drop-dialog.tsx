"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { dismissQuickDropAction } from "./actions"

export function DismissQuickDropDialog({
  itemId,
  content,
  open,
  onOpenChange,
}: {
  itemId: string
  content: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onConfirm(event: React.MouseEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await dismissQuickDropAction({ id: itemId })
      if (result.success) {
        onOpenChange(false)
        router.refresh()
        toast.success("Dismissed")
        return
      }
      setError(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss this capture?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{content.length > 120 ? `${content.slice(0, 120)}…` : content}&rdquo; will be
            deleted rather than turned into anything. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Dismissing…" : "Dismiss"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

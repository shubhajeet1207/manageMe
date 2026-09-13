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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteApplicationAction } from "./actions"

export function DeleteApplicationDialog({
  applicationId,
  label,
  taskCount = 0,
}: {
  applicationId: string
  label: string
  /** Tasks pointing at this application are UNLINKED, never deleted (§7.4), and
   *  the dialog names that before it happens. The board does not pass it. */
  taskCount?: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onConfirm(event: React.MouseEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await deleteApplicationAction({ id: applicationId })
      if (result.success) {
        setOpen(false)
        router.refresh()
        toast.success("Application deleted")
        return
      }
      toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the application. It cannot be undone.
            {taskCount > 0
              ? ` ${taskCount} task${taskCount === 1 ? "" : "s"} will be unlinked.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { setCurrentVersionAction } from "../actions"

export function SetCurrentVersionButton({
  resumeId,
  versionId,
  label,
}: {
  resumeId: string
  versionId: string
  label: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await setCurrentVersionAction({ resumeId, versionId })
      if (result.success) {
        router.refresh()
        toast.success("Current version updated")
        return
      }
      toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      aria-label={`Set ${label} as current`}
    >
      {isPending ? "Setting…" : "Set as current"}
    </Button>
  )
}

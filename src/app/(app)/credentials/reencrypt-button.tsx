"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { reencryptCredentialsAction } from "./actions"

/** The ONLY re-encryption path. Reveal is a read and deliberately does not
 *  write: a read path that writes can fail for a write reason. */
export function ReencryptButton({ count }: { count: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await reencryptCredentialsAction()
      if (result.success) {
        router.refresh()
        toast.success("Re-encrypted under the current key")
        return
      }
      toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? "Re-encrypting…" : `Re-encrypt ${count}`}
    </Button>
  )
}

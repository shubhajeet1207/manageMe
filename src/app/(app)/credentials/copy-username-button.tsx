"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CopyUsernameButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(username)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Your browser would not let this page write to the clipboard.")
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onCopy}
      aria-label={copied ? "Username copied" : `Copy ${username}`}
    >
      <CopyIcon />
    </Button>
  )
}

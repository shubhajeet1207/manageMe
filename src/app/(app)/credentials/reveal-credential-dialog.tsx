"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { revealCredentialAction } from "./actions"

/** The revealed value is dropped from component state after this long, and the
 *  timer is cleared on unmount. It is not retained anywhere else. */
const REVEAL_TIMEOUT_MS = 30_000

export function RevealCredentialDialog({
  credentialId,
  label,
  disabled = false,
  disabledReason,
}: {
  credentialId: string
  label: string
  disabled?: boolean
  disabledReason?: string
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function forget() {
    setSecret(null)
    setPassword("")
    setError(null)
    setCopied(false)
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await revealCredentialAction({ id: credentialId, password })
      if (result.success) {
        setSecret(result.secret)
        setPassword("")
        timer.current = setTimeout(() => setSecret(null), REVEAL_TIMEOUT_MS)
        // No router.refresh(): there is nothing to revalidate, and a refresh
        // would re-render the tree while a secret is in it.
        return
      }
      const fieldError = result.fieldErrors?.password?.[0]
      if (fieldError) setError(fieldError)
      else setError(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  async function onCopy() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      toast.error("Your browser would not let this page write to the clipboard.")
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        // Closing clears it immediately, without waiting for the timer.
        if (!next) forget()
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          Reveal
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reveal “{label}”</AlertDialogTitle>
          <AlertDialogDescription>
            {/* Every reveal asks again: there is deliberately no unlock window,
                because a window means storing "unlocked until T" somewhere. */}
            Confirm your ManageMe account password. Every reveal asks again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {secret ? (
          <div className="space-y-2">
            <Label htmlFor="revealed-secret">Password</Label>
            <div className="flex items-center gap-2">
              <Input
                id="revealed-secret"
                readOnly
                value={secret}
                className="font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={onCopy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              This clears itself in 30 seconds, and when you close this dialog. Anything you
              copy stays on your clipboard, which this app cannot clear.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2">
            <Label htmlFor="account-password">Account password</Label>
            <Input
              id="account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(null)
              }}
            />
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isPending || password === ""}>
              {/* argon2id is deliberately not instant, so the button says so. */}
              {isPending ? "Checking…" : "Reveal password"}
            </Button>
          </form>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{secret ? "Done" : "Cancel"}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

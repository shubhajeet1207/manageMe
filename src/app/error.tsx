"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

/**
 * The outermost boundary that still has a layout around it. It catches anything
 * thrown below the root layout that no closer error.tsx claimed — the /login and
 * /signup tree, the `/` redirect, a metadata function — and because the root
 * layout is still mounted, it renders with the app's fonts, palette and chosen
 * theme. Only a crash in the root layout itself escapes to global-error.tsx.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  /**
   * `retry`, not `reset` — Next passes both. `reset` only clears this
   * boundary's own state and re-renders the SAME server payload, so for the
   * failure this page actually sees (a query that threw during the server
   * render) it just redraws the error. `retry` calls router.refresh() first, so
   * the segment is genuinely re-fetched and a transient database blip recovers.
   */
  retry: () => void
}) {
  useEffect(() => {
    // The server already logged the real stack. This is the client-side half,
    // and in production it is the only record that a user ever saw the fallback;
    // `error.digest` is what ties the two together.
    console.error(error)
  }, [error])

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center p-6">
      <div className="border-card-border bg-card shadow-raised w-full max-w-md rounded-xl border p-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="bg-destructive size-2 rounded-[2px]" />
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
            Error
          </p>
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">This page didn&apos;t load</h1>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          The server hit an error while building it. Trying again re-fetches the page from
          scratch, which is enough for a temporary failure.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
        {/* The digest and nothing else. `error.message` is the original text for
            a client-thrown error and would put a Prisma error — table names,
            the connection string's host — on screen; the digest is an opaque
            hash of it, which is exactly what someone reporting this needs to
            let an operator find the matching server log. */}
        {error.digest ? (
          <p className="border-border text-subtlest mt-6 border-t pt-4 text-xs">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  )
}

"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

/**
 * Sits beside (app)/layout.tsx, which error.tsx deliberately does NOT wrap: the
 * layout keeps rendering, so the sidebar, the topbar and the session it already
 * resolved all survive and only the page area is replaced.
 *
 * That is the whole reason this file exists rather than letting the root
 * boundary catch it. The root one renders a full-page card with no shell, so a
 * failed /tasks query would look to the user exactly like being logged out.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  // `retry`, not `reset`: see the note in src/app/error.tsx. Every page in this
  // segment renders from a database read, so clearing the boundary without
  // re-fetching would draw the same error again.
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="border-border bg-card rounded-lg border px-6 py-12 text-center">
      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
        Error
      </p>
      <h1 className="mt-2 text-sm font-medium">This page didn&apos;t load</h1>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
        The server hit an error while building it. Trying again re-fetches the page, which is
        enough for a temporary failure. Everything else in the sidebar still works.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
      {/* Opaque hash only — never error.message, which for a Prisma failure
          carries table names and the database host. */}
      {error.digest ? (
        <p className="text-subtlest mt-6 text-xs">
          Reference <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  )
}

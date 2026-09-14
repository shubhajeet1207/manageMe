import Link from "next/link"
import { Button } from "@/components/ui/button"

/**
 * The root 404. It answers two different things with one screen: `notFound()`
 * thrown by a segment that has no closer not-found.tsx, and — per Next's routing
 * — every URL that matches no route at all.
 *
 * The one button points at /dashboard rather than /, and that is correct for a
 * signed-out visitor too: /dashboard is in proxy.ts's matcher, so they are sent
 * to /login with a callbackUrl and land on the dashboard once they sign in.
 *
 * The copy says nothing about whether a record exists. This page is reachable by
 * typing any id into any detail URL, and "this one is not yours" would turn a
 * 404 into a probe for other users' rows.
 */
export default function NotFound() {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center p-6">
      <div className="border-card-border bg-card shadow-raised w-full max-w-md rounded-xl border p-6">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
          404
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Nothing lives at this address. The link may be out of date, or whatever it pointed at
          may have been deleted.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}

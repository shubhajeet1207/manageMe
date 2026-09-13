import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { STATUS_ACCENT, STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { cn } from "@/lib/utils"

// The sidebar's wordmark, drawn at the size a first screen deserves: the mark
// is the board's own stage rules stacked into a funnel, in the stage hues the
// pipeline uses everywhere else.
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="bg-card border-card-border shadow-raised flex size-8 flex-col justify-center gap-[3px] rounded-md border p-1.5"
      >
        <span className="bg-stage-applied h-[3px] w-full rounded-full" />
        <span className="bg-stage-interview h-[3px] w-3/4 rounded-full" />
        <span className="bg-stage-accepted h-[3px] w-1/2 rounded-full" />
      </span>
      <span className="text-lg font-semibold tracking-tight">ManageMe</span>
    </div>
  )
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="bg-background min-h-dvh lg:grid lg:min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-surface border-border hidden flex-col justify-between border-r p-10 lg:flex xl:p-14">
        <Wordmark />
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            Every application, one pipeline.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Track each role from saved to offer, keep the company notes beside it,
            and see exactly where every conversation stands.
          </p>
          <ul className="mt-10 space-y-3">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn("h-[3px] w-10 shrink-0 rounded-full", STATUS_ACCENT[status])}
                />
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-[0.09em] uppercase",
                    status === "REJECTED" ? "text-subtlest" : "text-muted-foreground"
                  )}
                >
                  {STATUS_LABELS[status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-subtlest text-xs">
          Your applications, companies and notes stay in your own account.
        </p>
      </section>

      <main className="flex min-h-dvh items-center justify-center p-6 lg:min-h-0">
        <div className="w-full max-w-sm space-y-8">
          <Wordmark className="justify-center lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  )
}

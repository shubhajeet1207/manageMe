import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { STATUS_ACCENT, STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { RetroWindow } from "@/components/retro-window"
import { Sparkles } from "@/components/sparkles"
import { Wordmark } from "@/components/wordmark"
import { cn } from "@/lib/utils"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="bg-background min-h-dvh lg:grid lg:min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* The orange mood board: a desk of windows and sparkles. Text here is
          ink in both themes — ink on orange is 8.1:1, cream would not pass. */}
      <section className="bg-window-orange border-card-border text-ink relative hidden flex-col justify-between overflow-hidden border-r-2 p-10 lg:flex xl:p-14">
        <Sparkles />
        <Wordmark className="relative" />
        <RetroWindow
          title="pipeline.exe"
          tone="lavender"
          className="relative max-w-md"
          bodyClassName="p-6"
        >
          <h2 className="font-heading text-3xl leading-tight font-normal text-balance">
            Every application, one pipeline.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Track each role from saved to offer, keep the company notes beside it,
            and see exactly where every conversation stands.
          </p>
          <ul className="mt-8 space-y-2.5">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn("border-card-border h-3 w-10 shrink-0 border-2", STATUS_ACCENT[status])}
                />
                <span
                  className={cn(
                    "eyebrow font-bold",
                    status === "REJECTED" ? "text-subtlest" : "text-muted-foreground"
                  )}
                >
                  {STATUS_LABELS[status]}
                </span>
              </li>
            ))}
          </ul>
        </RetroWindow>
        <p className="bg-window-tan relative w-fit border-2 border-[#201a3a] px-3 py-1.5 text-xs shadow-[3px_3px_0_#201a3a]">
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

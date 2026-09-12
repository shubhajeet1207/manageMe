import Link from "next/link"
import { auth } from "@/lib/auth/auth"
import { findById } from "@/server/repositories/user-repository"
import { listApplications } from "@/server/services/application-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { STATUS_ACCENT, STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { cn } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user?.id ? await findById(session.user.id) : null
  const name = user?.name ?? user?.email ?? "there"
  const applications = session?.user?.id ? await listApplications(session.user.id) : []

  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: applications.filter((application) => application.status === status).length,
  }))
  const inPlay = applications.filter(
    (application) => application.status !== "REJECTED" && application.status !== "ACCEPTED"
  ).length
  const late = applications.filter(
    (application) =>
      application.status === "INTERVIEW" ||
      application.status === "OFFER" ||
      application.status === "ACCEPTED"
  ).length

  const stats = [
    { label: "Tracked", value: applications.length },
    { label: "In play", value: inPlay },
    { label: "Interview or better", value: late },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${name}`}
        description="Where every application stands right now."
      >
        <Button asChild>
          <Link href="/applications">Open the board</Link>
        </Button>
      </PageHeader>

      {applications.length === 0 ? (
        <EmptyState
          title="Nothing in the pipeline yet"
          description="Add an application and the funnel below will start filling in."
        >
          <Button asChild>
            <Link href="/applications">Add an application</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <dl className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-border bg-card rounded-lg border px-4 py-3"
              >
                <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <section
            aria-label="Pipeline"
            className="border-border bg-card space-y-4 rounded-lg border p-4"
          >
            <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
              Pipeline
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
              {counts.map(({ status, count }) => (
                <div
                  key={status}
                  className={cn(
                    "min-w-0",
                    status === "REJECTED" && "border-border lg:ml-2 lg:border-l lg:pl-3"
                  )}
                >
                  <div
                    className={cn("h-0.5 w-full rounded-full", STATUS_ACCENT[status])}
                    aria-hidden
                  />
                  <p
                    className={cn(
                      "mt-2 truncate text-[11px] font-semibold tracking-[0.09em] uppercase",
                      status === "REJECTED" && "text-muted-foreground"
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </p>
                  <p className="mt-0.5 text-lg font-medium tabular-nums">{count}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

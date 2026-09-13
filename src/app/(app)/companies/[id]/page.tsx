import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { CompanyNotFoundError, getCompany } from "@/server/services/company-service"
import { listApplicationsForCompany } from "@/server/services/application-service"
import { listVersionsForUser } from "@/server/services/resume-service"
import { ApplicationTable } from "@/app/(app)/applications/application-table"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  let company
  let applications
  try {
    company = await getCompany(session.user.id, id)
    applications = await listApplicationsForCompany(session.user.id, id)
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound()
    throw error
  }

  const versions = await listVersionsForUser(session.user.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={
          [company.location, company.website].filter(Boolean).join(" · ") || "No details yet"
        }
      />

      {company.notes ? (
        <p className="text-muted-foreground max-w-2xl text-sm whitespace-pre-wrap">
          {company.notes}
        </p>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
          Applications <span className="tabular-nums">({applications.length})</span>
        </h2>
        {applications.length === 0 ? (
          <EmptyState
            title="No applications here yet"
            description="Applications you add for this company will be listed here."
          />
        ) : (
          <ApplicationTable applications={applications} versions={versions} />
        )}
      </div>
    </div>
  )
}

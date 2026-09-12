import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { CompanyNotFoundError, getCompany } from "@/server/services/company-service"
import { listApplicationsForCompany } from "@/server/services/application-service"
import { ApplicationTable } from "@/app/(app)/applications/application-table"

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  try {
    const company = await getCompany(session.user.id, id)
    const applications = await listApplicationsForCompany(session.user.id, id)

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[company.location, company.website].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>

        {company.notes ? <p className="text-sm whitespace-pre-wrap">{company.notes}</p> : null}

        <div className="space-y-2">
          <h2 className="font-medium">
            Applications ({applications.length})
          </h2>
          {applications.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              No applications at this company yet.
            </p>
          ) : (
            <ApplicationTable applications={applications} />
          )}
        </div>
      </div>
    )
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound()
    throw error
  }
}

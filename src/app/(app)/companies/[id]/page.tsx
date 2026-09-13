import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { CompanyNotFoundError, getCompany } from "@/server/services/company-service"
import { listApplicationsForCompany } from "@/server/services/application-service"
import { listDocumentsForCompany } from "@/server/services/document-service"
import { listVersionsForUser } from "@/server/services/resume-service"
import {
  countOpenTasksByApplication,
  countTasksByApplication,
} from "@/server/services/task-service"
import { ApplicationTable } from "@/app/(app)/applications/application-table"
import { formatDate } from "@/app/(app)/documents/format"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { TagChip } from "@/components/tag-chip"

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
      {children}
    </h2>
  )
}

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

  const [versions, documents, openTaskCounts, taskCounts] = await Promise.all([
    listVersionsForUser(session.user.id),
    // The payoff for companyId being a real relation rather than a string:
    // "what do I have from Acme" is the question a vault filed by company is
    // for. Scoped by userId like every other read here.
    listDocumentsForCompany(session.user.id, id),
    countOpenTasksByApplication(session.user.id),
    countTasksByApplication(session.user.id),
  ])

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
        <SectionHeading>
          Applications <span className="tabular-nums">({applications.length})</span>
        </SectionHeading>
        {applications.length === 0 ? (
          <EmptyState
            title="No applications here yet"
            description="Applications you add for this company will be listed here."
          />
        ) : (
          <ApplicationTable
            applications={applications}
            versions={versions}
            openTaskCounts={openTaskCounts}
            taskCounts={taskCounts}
          />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading>
          Documents <span className="tabular-nums">({documents.length})</span>
        </SectionHeading>
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing filed against this company yet. Tag a document with it when you
            upload one.
          </p>
        ) : (
          <ul className="border-card-border bg-card divide-card-border divide-y rounded-lg border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/documents/${document.id}`}
                    className="focus-visible:ring-ring rounded-sm text-sm font-medium outline-none [overflow-wrap:anywhere] hover:underline focus-visible:ring-2"
                  >
                    {document.title}
                  </Link>
                  {document.tags.map((tag) => (
                    <TagChip key={tag}>{tag}</TagChip>
                  ))}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatDate(document.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { ResumeNotFoundError, getResumeDetail } from "@/server/services/resume-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { PdfPreview } from "@/components/pdf-preview"
import { DeleteResumeDialog } from "../delete-resume-dialog"
import { formatDate } from "../format"
import { ResumeSheet } from "../resume-sheet"
import { UploadVersionSheet } from "../upload-version-sheet"
import { ResumeUsage } from "./resume-usage"
import { VersionList } from "./version-list"

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
      {children}
    </h2>
  )
}

export default async function ResumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  let detail
  try {
    detail = await getResumeDetail(session.user.id, id)
  } catch (error) {
    // A resume that does not exist and one that is not yours render the same
    // page. The two cases are indistinguishable by design.
    if (error instanceof ResumeNotFoundError) notFound()
    throw error
  }

  const { resume, versions, applications, stats } = detail
  const current = resume.currentVersion

  return (
    <div className="space-y-6">
      <PageHeader
        title={resume.name}
        description={
          current
            ? `Current version: ${current.label} · uploaded ${formatDate(current.createdAt)}`
            : "No versions uploaded yet."
        }
      >
        <UploadVersionSheet
          resumeId={resume.id}
          trigger={<Button>Upload new version</Button>}
        />
        <ResumeSheet
          resume={resume}
          trigger={
            <Button variant="outline" size="sm">
              Edit
            </Button>
          }
        />
        <DeleteResumeDialog
          resumeId={resume.id}
          resumeName={resume.name}
          redirectTo="/resumes"
        />
      </PageHeader>

      {resume.notes ? (
        <p className="text-muted-foreground max-w-2xl text-sm whitespace-pre-wrap">
          {resume.notes}
        </p>
      ) : null}

      <div className="space-y-3">
        <SectionHeading>Preview</SectionHeading>
        {current ? (
          <PdfPreview
            src={`/api/resume-versions/${current.id}/file`}
            label={current.label}
          />
        ) : (
          <EmptyState
            title="Nothing to preview yet"
            description="Upload a PDF and it appears here, rendered by your browser's own viewer."
          >
            <UploadVersionSheet
              resumeId={resume.id}
              trigger={<Button>Upload the first version</Button>}
            />
          </EmptyState>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading>
          Versions <span className="tabular-nums">({versions.length})</span>
        </SectionHeading>
        {versions.length === 0 ? (
          <EmptyState
            title="No versions yet"
            description="Every upload adds a version rather than replacing one, so this list is the record of what you sent and when."
          />
        ) : (
          <VersionList
            resumeId={resume.id}
            versions={versions}
            currentVersionId={resume.currentVersionId}
          />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading>Used by</SectionHeading>
        <ResumeUsage stats={stats} applications={applications} />
      </div>
    </div>
  )
}

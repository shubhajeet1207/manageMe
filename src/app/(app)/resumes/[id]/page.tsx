import { ExternalLinkIcon } from "lucide-react"
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
import { ProjectList } from "./project-list"
import { ProjectSheet } from "./project-sheet"
import { ResumeUsage } from "./resume-usage"
import { SkillsEditor } from "./skills-editor"
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

  const { resume, versions, projects, applications, stats } = detail
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SectionHeading>Preview</SectionHeading>
          {current ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/resume-versions/${current.id}/file`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${current.label} in a new tab`}
              >
                <ExternalLinkIcon className="size-3.5" />
                Open full screen
              </a>
            </Button>
          ) : null}
        </div>
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

      <div className="space-y-3">
        <SectionHeading>
          Skills <span className="tabular-nums">({resume.skills.length})</span>
        </SectionHeading>
        <SkillsEditor resumeId={resume.id} skills={resume.skills} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SectionHeading>
            Projects <span className="tabular-nums">({projects.length})</span>
          </SectionHeading>
          {projects.length > 0 ? (
            <ProjectSheet
              resumeId={resume.id}
              trigger={
                <Button variant="outline" size="sm">
                  Add project
                </Button>
              }
            />
          ) : null}
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects listed"
            description="Projects are the evidence behind the skills — the billing-service rebuild, the migration you actually ran. List the two or three this resume leads with and they are here the next time you tailor it."
          >
            <ProjectSheet
              resumeId={resume.id}
              trigger={<Button>Add the first project</Button>}
            />
          </EmptyState>
        ) : (
          <ProjectList resumeId={resume.id} projects={projects} />
        )}
      </div>
    </div>
  )
}

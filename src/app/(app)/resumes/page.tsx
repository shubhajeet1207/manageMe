import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { countUnlinkedApplications, listResumes } from "@/server/services/resume-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { ResumeSheet } from "./resume-sheet"
import { ResumeTable } from "./resume-table"

export default async function ResumesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [resumes, unlinked] = await Promise.all([
    listResumes(session.user.id),
    countUnlinkedApplications(session.user.id),
  ])

  const versions = resumes.reduce((total, resume) => total + resume._count.versions, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumes"
        description={`${resumes.length} resume${resumes.length === 1 ? "" : "s"} · ${versions} version${
          versions === 1 ? "" : "s"
        } uploaded.`}
      >
        <ResumeSheet trigger={<Button>Add resume</Button>} />
      </PageHeader>

      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes yet"
          description={
            <>
              A resume is a named slot &mdash; &ldquo;Backend SWE&rdquo;, &ldquo;Data
              roles&rdquo; &mdash; holding every PDF you have uploaded for it. Uploading
              adds a version instead of replacing one, so you can still open the exact
              file you sent six weeks ago.
            </>
          }
        >
          <ResumeSheet trigger={<Button>Add your first resume</Button>} />
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <ResumeTable resumes={resumes} />
          {/* Applications with no version linked appear in no resume's numbers,
              so the figure is stated rather than quietly dropped. */}
          {unlinked > 0 ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              {unlinked} application{unlinked === 1 ? " has" : "s have"} no resume linked,
              so {unlinked === 1 ? "it counts" : "they count"} towards none of these
              numbers.{" "}
              <Link href="/applications?view=table" className="underline">
                Open the applications table
              </Link>{" "}
              to link {unlinked === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

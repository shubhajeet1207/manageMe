import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { listLinkTags, listLinks } from "@/server/services/link-service"
import { LinkSheet } from "./link-sheet"
import { LinkTable } from "./link-table"
import { TagFilter } from "./tag-filter"

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const params = await searchParams
  const raw = Array.isArray(params.tag) ? params.tag[0] : params.tag
  const tag = raw?.trim() ? raw.trim() : undefined

  const [links, tags] = await Promise.all([
    listLinks(session.user.id, tag),
    listLinkTags(session.user.id),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Links"
        description="Reference URLs that belong to nothing else — saved, titled and tagged."
      >
        <LinkSheet suggestions={tags} trigger={<Button>Save a link</Button>} />
      </PageHeader>

      <TagFilter tags={tags} active={tag ?? null} />

      {links.length === 0 ? (
        <EmptyState
          title={tag ? "No links with that tag" : "No links yet"}
          description={
            tag
              ? "Nothing here right now. Choose All to see the rest."
              : "A salary guide, an interview-prep article, a recruiter's scheduling page. Anything that does not already belong to an application or a resume."
          }
        >
          <LinkSheet suggestions={tags} trigger={<Button>Save your first link</Button>} />
        </EmptyState>
      ) : (
        <LinkTable links={links} suggestions={tags} />
      )}
    </div>
  )
}

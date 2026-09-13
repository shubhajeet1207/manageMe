import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listCompanies } from "@/server/services/company-service"
import {
  countDocuments,
  listDocumentTags,
  listDocuments,
} from "@/server/services/document-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { DocumentSheet } from "./document-sheet"
import { DocumentTable } from "./document-table"
import { DocumentToolbar } from "./document-toolbar"
import { documentsHref, parseQuery, parseTags } from "./search-params"

/** How many of the user's own tags the upload sheet offers as one-click
 *  suggestions before falling back to the seed set. */
const SUGGESTED_TAG_COUNT = 5

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; tag?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const params = await searchParams
  const filters = { query: parseQuery(params.q), tags: parseTags(params.tag) }

  const [documents, tagCounts, total, companies] = await Promise.all([
    listDocuments(session.user.id, filters),
    listDocumentTags(session.user.id),
    countDocuments(session.user.id),
    listCompanies(session.user.id),
  ])

  const filtered = filters.query !== "" || filters.tags.length > 0
  const popularTags = tagCounts.slice(0, SUGGESTED_TAG_COUNT).map(({ tag }) => tag)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={`${total} document${total === 1 ? "" : "s"} filed${
          filtered ? ` · ${documents.length} matching` : ""
        }.`}
      >
        <DocumentSheet
          companies={companies}
          popularTags={popularTags}
          trigger={<Button>Upload document</Button>}
        />
      </PageHeader>

      {total === 0 ? (
        // The vault is empty. This is a different state from "filters match
        // nothing" and deliberately a different component call: a user with 40
        // documents and a typo must not be told their vault is empty.
        <EmptyState
          title="Nothing in your vault yet"
          description={
            <>
              The vault holds the documents a career produces &mdash; offer letters,
              payslips, certificates, ID proofs, NDAs. They are private to you: there is
              no link that shares one, and no path to a file that is not checked against
              your account first.
            </>
          }
        >
          <DocumentSheet
            companies={companies}
            popularTags={popularTags}
            trigger={<Button>Upload your first document</Button>}
          />
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <DocumentToolbar filters={filters} tagCounts={tagCounts} />

          {documents.length === 0 ? (
            <EmptyState
              title={
                filters.query
                  ? `No documents match “${filters.query}”`
                  : "No documents match those tags"
              }
              description={
                <>
                  {filters.tags.length > 0 ? (
                    <>
                      Filtering by {filters.tags.map((tag) => `“${tag}”`).join(" and ")}
                      {filters.query ? " as well as the search term" : ""}. Tags narrow
                      rather than widen, so two of them match fewer documents than one.
                    </>
                  ) : (
                    <>Titles, tags and filenames are searched &mdash; not file contents.</>
                  )}
                </>
              }
            >
              <Button variant="outline" asChild>
                <Link href={documentsHref({ query: "", tags: [] })}>Clear filters</Link>
              </Button>
            </EmptyState>
          ) : (
            <DocumentTable documents={documents} />
          )}
        </div>
      )}
    </div>
  )
}

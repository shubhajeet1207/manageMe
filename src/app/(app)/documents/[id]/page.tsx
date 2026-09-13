import { DownloadIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listCompanies } from "@/server/services/company-service"
import {
  DocumentNotFoundError,
  getDocument,
  listDocumentTags,
} from "@/server/services/document-service"
import { findContentType } from "@/server/files/content-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DocumentPreview } from "@/components/document-preview"
import { PageHeader } from "@/components/page-header"
import { TagChip } from "@/components/tag-chip"
import { DeleteDocumentDialog } from "../delete-document-dialog"
import { DocumentSheet } from "../document-sheet"
import { ExpiryBadge } from "../expiry-badge"
import { formatDate, formatFileSize } from "../format"
import { documentsHref } from "../search-params"

const SUGGESTED_TAG_COUNT = 5

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
      {children}
    </h2>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  let document
  try {
    document = await getDocument(session.user.id, id)
  } catch (error) {
    // A document that does not exist and one that is not yours render the same
    // page. The two cases are indistinguishable by design.
    if (error instanceof DocumentNotFoundError) notFound()
    throw error
  }

  const [companies, tagCounts] = await Promise.all([
    listCompanies(session.user.id),
    listDocumentTags(session.user.id),
  ])

  // The authorising route, and the only path to these bytes. Nothing under
  // .uploads/ is statically served.
  const fileHref = `/api/documents/${document.id}/file`
  const spec = findContentType(document.contentType)

  return (
    <div className="space-y-6">
      <PageHeader
        title={document.title}
        description={`${spec?.label ?? "File"} · ${formatFileSize(document.sizeBytes)} · added ${formatDate(
          document.createdAt
        )}`}
      >
        <Button variant="outline" size="sm" asChild>
          <a
            href={fileHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${document.title} in a new tab`}
          >
            <ExternalLinkIcon className="size-3.5" />
            Open
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`${fileHref}?download=1`}>
            <DownloadIcon className="size-3.5" />
            Download
          </a>
        </Button>
        <DocumentSheet
          companies={companies}
          popularTags={tagCounts.slice(0, SUGGESTED_TAG_COUNT).map(({ tag }) => tag)}
          document={document}
          trigger={
            <Button variant="outline" size="sm">
              Edit
            </Button>
          }
        />
        <DeleteDocumentDialog
          documentId={document.id}
          documentTitle={document.title}
          redirectTo="/documents"
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ExpiryBadge expiresOn={document.expiresOn} />
        {document.company ? (
          <Link
            href={`/companies/${document.company.id}`}
            className="text-sm underline underline-offset-4"
          >
            {document.company.name}
          </Link>
        ) : null}
        {document.tags.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1.5">
            {document.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={documentsHref({ query: "", tags: [tag] })}
                  className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
                >
                  <TagChip>{tag}</TagChip>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-3">
        <SectionHeading>Preview</SectionHeading>
        <DocumentPreview
          src={fileHref}
          title={document.title}
          contentType={document.contentType}
          filename={document.originalFilename}
        />
      </div>

      <div className="space-y-3">
        <SectionHeading>Details</SectionHeading>
        <dl className="border-card-border bg-card grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Description">
            {document.description ? (
              <span className="whitespace-pre-wrap">{document.description}</span>
            ) : (
              <span className="text-muted-foreground">&mdash;</span>
            )}
          </Detail>
          <Detail label="Original filename">{document.originalFilename}</Detail>
          <Detail label="Type">
            <Badge variant="outline">{spec?.label ?? "File"}</Badge>
          </Detail>
          <Detail label="Size">
            <span className="tabular-nums">{formatFileSize(document.sizeBytes)}</span>
          </Detail>
          <Detail label="Added">
            <span className="tabular-nums">{formatDate(document.createdAt)}</span>
          </Detail>
          <Detail label="Expires">
            {document.expiresOn ? (
              <span className="tabular-nums">{formatDate(document.expiresOn)}</span>
            ) : (
              <span className="text-muted-foreground">&mdash;</span>
            )}
          </Detail>
        </dl>
      </div>
    </div>
  )
}

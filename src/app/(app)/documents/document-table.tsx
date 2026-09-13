import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TagChip } from "@/components/tag-chip"
import { findContentType } from "@/server/files/content-types"
import type { DocumentWithCompany } from "@/server/repositories/document-repository"
import { ExpiryBadge } from "./expiry-badge"
import { formatDate, formatFileSize } from "./format"

/** Enough to recognise a document by without the column becoming the row. The
 *  rest are counted, and named in the count's tooltip. */
const VISIBLE_TAGS = 3

/**
 * A table, not a card grid. The thing that would justify a grid is a thumbnail
 * per document, and thumbnails need server-side image processing this phase
 * refuses — plus a PDF, which is most of a career vault, has no thumbnail at
 * all. A grid of identical file icons is a grid pretending to be a gallery.
 */
export function DocumentTable({ documents }: { documents: DocumentWithCompany[] }) {
  return (
    // The same single-scroller frame as /companies and /resumes: the inner
    // container's overflow is neutralised so the bordered frame is the one
    // thing that scrolls, and below lg the table keeps a readable strip rather
    // than crushing six columns into a phone.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[900px] lg:min-w-[800px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Title</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="w-20">Type</TableHead>
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-28">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => {
            // A lookup, never the stored string rendered raw: a type the
            // registry no longer knows reads as "File" rather than as
            // whatever a row happens to carry.
            const spec = findContentType(document.contentType)
            return (
              <TableRow key={document.id} className="[&>td]:px-3 [&>td]:py-1.5">
                <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/documents/${document.id}`} className="hover:underline">
                      {document.title}
                    </Link>
                    <ExpiryBadge expiresOn={document.expiresOn} />
                  </span>
                  <span className="text-muted-foreground block text-xs [overflow-wrap:anywhere]">
                    {document.originalFilename}
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {document.tags.length === 0 ? (
                    <span className="text-muted-foreground">&mdash;</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1">
                      {document.tags.slice(0, VISIBLE_TAGS).map((tag) => (
                        <TagChip key={tag}>{tag}</TagChip>
                      ))}
                      {document.tags.length > VISIBLE_TAGS ? (
                        <span
                          className="text-muted-foreground text-xs tabular-nums"
                          title={document.tags.slice(VISIBLE_TAGS).join(", ")}
                        >
                          +{document.tags.length - VISIBLE_TAGS}
                        </span>
                      ) : null}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                  {document.company ? (
                    <Link
                      href={`/companies/${document.company.id}`}
                      className="hover:underline"
                    >
                      {document.company.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{spec?.label ?? "File"}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatFileSize(document.sizeBytes)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDate(document.createdAt)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

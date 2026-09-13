import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TagChip } from "@/components/tag-chip"
import type { Link as LinkRow } from "@prisma/client"
import { DeleteLinkDialog } from "./delete-link-dialog"
import { LinkSheet } from "./link-sheet"

const ADDED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** Host only, so the column does not blow the layout out. The stored URL has
 *  already been restricted to http:/https: by the schema; `rel` is the separate
 *  control that stops the opened tab reaching back through `window.opener`. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function LinkTable({
  links,
  suggestions,
}: {
  links: LinkRow[]
  suggestions: string[]
}) {
  return (
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[760px] lg:min-w-[560px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Title</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="text-right">Added</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((link) => (
            <TableRow key={link.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {link.title}
                </a>
                {link.description ? (
                  <p className="text-muted-foreground mt-0.5 text-xs font-normal">
                    {link.description}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                {hostOf(link.url)}
              </TableCell>
              <TableCell>
                {link.tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {link.tags.map((tag) => (
                      <TagChip key={tag}>{tag}</TagChip>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {ADDED.format(link.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <LinkSheet
                  link={link}
                  suggestions={suggestions}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteLinkDialog linkId={link.id} linkTitle={link.title} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

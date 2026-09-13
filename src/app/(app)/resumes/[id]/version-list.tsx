import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResumeVersion } from "@prisma/client"
import { formatDate, formatFileSize } from "../format"
import { SetCurrentVersionButton } from "./set-current-version-button"

export function VersionList({
  resumeId,
  versions,
  currentVersionId,
}: {
  resumeId: string
  versions: ResumeVersion[]
  currentVersionId: string | null
}) {
  return (
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[760px] lg:min-w-[620px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Label</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="xl:w-28">Uploaded</TableHead>
            <TableHead className="w-48 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                <span className="flex flex-wrap items-center gap-1.5">
                  {version.label}
                  {version.id === currentVersionId ? (
                    <Badge
                      variant="secondary"
                      className="bg-selected text-selected-foreground rounded-sm px-1.5 py-0 text-[11px] leading-4 font-bold tracking-[0.03em] uppercase"
                    >
                      Current
                    </Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                {version.originalFilename}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatFileSize(version.sizeBytes)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDate(version.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                {version.id === currentVersionId ? null : (
                  <SetCurrentVersionButton
                    resumeId={resumeId}
                    versionId={version.id}
                    label={version.label}
                  />
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={`/api/resume-versions/${version.id}/file`}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Open ${version.label}`}
                  >
                    Open
                  </a>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

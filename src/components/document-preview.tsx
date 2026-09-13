import { DownloadIcon, ExternalLinkIcon, FileIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImagePreview } from "@/components/image-preview"
import { PdfPreview } from "@/components/pdf-preview"
import { findContentType } from "@/server/files/content-types"

/**
 * One component, three branches, dispatched on the registry's preview mode
 * (§8.9) — never on the filename and never on a client-supplied string.
 */
export function DocumentPreview({
  src,
  title,
  contentType,
  filename,
}: {
  src: string
  title: string
  contentType: string
  filename: string
}) {
  const spec = findContentType(contentType)

  if (spec?.previewMode === "pdf") return <PdfPreview src={src} label={title} />
  if (spec?.previewMode === "image") return <ImagePreview src={src} label={title} />

  // Reachable only for a row whose type has since left the registry — which is
  // exactly the row that is served as an opaque attachment (§8.6). It gets the
  // file card and two working buttons rather than an empty grey box.
  return (
    <div className="border-card-border bg-card flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <FileIcon className="text-subtlest size-6" aria-hidden />
      <div>
        <p className="text-sm font-medium">No preview for this file type</p>
        <p className="text-muted-foreground mt-1 text-sm [overflow-wrap:anywhere]">{filename}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={src} target="_blank" rel="noreferrer noopener">
            <ExternalLinkIcon className="size-3.5" />
            Open
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`${src}?download=1`}>
            <DownloadIcon className="size-3.5" />
            Download
          </a>
        </Button>
      </div>
    </div>
  )
}

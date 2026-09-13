import { cn } from "@/lib/utils"

/**
 * The browser's own PDF viewer (§8.6). `<object>` rather than `<iframe>` or
 * `<embed>` because it is the only one of the three with a standard
 * fallback-children mechanism — and the fallback is a requirement, not a
 * nicety: iOS Safari and several mobile browsers do not render PDFs in-page at
 * all, and a mobile user must get a working link rather than a blank rectangle.
 *
 * `src` is always the authorising route. The component cannot be handed a raw
 * file path because none exists.
 *
 * Fixed aspect ratio and a minimum height so the page does not reflow when the
 * viewer draws, and no spinner: `<object>`'s load event is unreliable across
 * browsers and the native viewer draws its own loading state.
 */
export const PREVIEW_BOX = "aspect-[4/3] max-h-[70vh] min-h-[24rem] w-full max-w-4xl"

export function PdfPreview({
  src,
  label,
  className,
}: {
  src: string
  label: string
  className?: string
}) {
  return (
    <div
      className={cn(
        PREVIEW_BOX,
        "border-card-border bg-well overflow-hidden rounded-lg border",
        className
      )}
    >
      <object
        data={src}
        type="application/pdf"
        aria-label={`Preview of ${label}`}
        className="h-full w-full"
      >
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-sm font-medium">Your browser can&rsquo;t preview PDFs.</p>
          <p className="text-muted-foreground text-sm">
            <a href={src} target="_blank" rel="noreferrer noopener" className="underline">
              Open {label}
            </a>{" "}
            or{" "}
            <a href={`${src}?download=1`} className="underline">
              download it
            </a>
            .
          </p>
        </div>
      </object>
    </div>
  )
}

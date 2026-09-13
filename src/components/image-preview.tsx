import { cn } from "@/lib/utils"
import { PREVIEW_BOX } from "@/components/pdf-preview"

/**
 * A plain `<img>`, and **not** `next/image` — the reason is concrete rather
 * than stylistic (§8.9). The image optimizer fetches the URL server-side,
 * without the user's session cookie, so every request would hit the serving
 * route's unauthenticated 404. Making it work would mean `remotePatterns` for
 * our own private route, and `dangerouslyAllowSVG` sits one line away in that
 * same config block. A plain `<img>` loads with the browser's own credentialed
 * request, which is the only thing that works here.
 *
 * Same `PREVIEW_BOX` as the PDF branch so the page does not reflow between
 * document types, and no spinner: an `<img>` draws progressively, and faking
 * one would be a fake UI.
 */
export function ImagePreview({
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
        "border-card-border bg-well flex items-center justify-center overflow-hidden rounded-lg border p-3",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- §8.9: the
          optimizer fetches server-side without the session cookie and would
          always 404 on this private route. */}
      <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
    </div>
  )
}

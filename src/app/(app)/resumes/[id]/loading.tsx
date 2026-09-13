import { Skeleton } from "@/components/ui/skeleton"
import { PREVIEW_BOX } from "@/components/pdf-preview"
import { cn } from "@/lib/utils"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        {/* The same fixed-aspect box the <object> occupies, so the page does not
            jump when the real preview arrives. */}
        <Skeleton className={cn(PREVIEW_BOX, "rounded-lg")} />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}

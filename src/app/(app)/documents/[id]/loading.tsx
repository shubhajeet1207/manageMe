import { Skeleton } from "@/components/ui/skeleton"
import { PREVIEW_BOX } from "@/components/pdf-preview"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="border-border flex items-end justify-between border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      {/* The same constant the real preview uses, rather than restated
          classes: a skeleton that guesses at the box is how Phase 2 shipped
          one that overflowed the viewport. */}
      <Skeleton className={PREVIEW_BOX} />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

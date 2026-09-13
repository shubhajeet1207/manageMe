import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="border-border flex items-end justify-between border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-56" />
      </div>
      {/* Same scroller/grid switch as ApplicationBoard. Seven 16rem columns are
          wider than the viewport below xl, and without the scroller they widen
          the document itself rather than an inner strip. */}
      <div className="flex gap-3 overflow-x-auto pb-3 xl:grid xl:grid-cols-7 xl:gap-2 xl:overflow-x-visible xl:pb-0">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="w-64 shrink-0 space-y-2 xl:w-auto xl:min-w-0 xl:shrink"
          >
            <Skeleton className="h-[3px] w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

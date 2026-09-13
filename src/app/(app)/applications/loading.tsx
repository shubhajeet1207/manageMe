import { Fragment } from "react"
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
      {/* Same scroller/grid switch, outcome divider track and viewport height as
          ApplicationBoard, so the board does not jump when the data arrives.
          Seven 16rem columns are wider than the viewport below xl, and without
          the scroller they widen the document itself rather than an inner
          strip. */}
      <div className="flex gap-3 overflow-x-auto pb-3 xl:grid xl:h-[calc(100dvh-12.3125rem)] xl:grid-cols-[repeat(6,minmax(0,1fr))_auto_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-2 xl:overflow-x-visible xl:pb-0">
        {Array.from({ length: 7 }).map((_, index) => (
          <Fragment key={index}>
            {index === 6 ? (
              <div className="bg-border hidden w-px xl:mx-0.5 xl:block" />
            ) : null}
            <div className="flex w-64 shrink-0 flex-col gap-2 xl:w-auto xl:min-w-0 xl:shrink">
              <Skeleton className="h-[3px] w-full shrink-0" />
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-48 w-full xl:h-auto xl:flex-1" />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

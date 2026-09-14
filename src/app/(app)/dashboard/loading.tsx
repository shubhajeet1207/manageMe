import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="border-border flex items-end justify-between border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      {/* The Pipeline section is skeletoned too. It used to pop in unskeletoned
          after the tiles above had already settled (§9.2.4). */}
      <div className="border-border bg-card space-y-4 rounded-lg border p-4">
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-2">
              <Skeleton className="h-[3px] w-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

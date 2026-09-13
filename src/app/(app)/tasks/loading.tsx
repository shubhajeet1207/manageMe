import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      {/* The same grouped shape the list renders, so the skeleton does not
          collapse into one block and then jump into sections. */}
      <div className="space-y-5">
        {[0, 1].map((group) => (
          <div key={group} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

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
      <div className="flex gap-3 lg:grid lg:grid-cols-7 lg:gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="w-64 shrink-0 space-y-2 lg:w-auto lg:shrink">
            <Skeleton className="h-0.5 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

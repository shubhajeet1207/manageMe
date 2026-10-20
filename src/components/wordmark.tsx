import { cn } from "@/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* The retro brand tile: a cream window with an ink edge and a hard
          shadow, holding the pipeline's first three stage colours. */}
      <span
        aria-hidden
        className="bg-card border-card-border shadow-raised flex size-9 flex-col justify-center gap-[3px] border-2 p-1.5"
      >
        <span className="bg-stage-applied h-[4px] w-full" />
        <span className="bg-stage-interview h-[4px] w-3/4" />
        <span className="bg-stage-accepted h-[4px] w-1/2" />
      </span>
      <span className="font-heading text-xl tracking-[0.02em]">ManageMe</span>
    </div>
  )
}

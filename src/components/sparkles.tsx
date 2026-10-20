import { cn } from "@/lib/utils"

// Positions are fixed (not random) so server and client render the same tree,
// and they hug the edges: decoration must never sit on text. The top-left
// corner stays clear because that is where wordmarks live.
const STARS = [
  { top: "3%", left: "46%", size: 18 },
  { top: "5%", left: "86%", size: 26 },
  { top: "34%", left: "95.5%", size: 18 },
  { top: "58%", left: "1.5%", size: 20 },
  { top: "94%", left: "74%", size: 22 },
  { top: "86%", left: "96%", size: 16 },
]
const DOTS = [
  { top: "2.5%", left: "66%" },
  { top: "62%", left: "97%" },
  { top: "36%", left: "1%" },
  { top: "97%", left: "88%" },
]

function Star({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2c.6 4.6 2.4 6.9 7.5 8-5.1 1.1-6.9 3.4-7.5 8-.6-4.6-2.4-6.9-7.5-8C9.6 8.9 11.4 6.6 12 2Z"
        fill="var(--card)"
        stroke="var(--card-border)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The stars and rings scattered around the windows on the mood boards. */
export function Sparkles({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {STARS.map((star) => (
        <span key={`${star.top}-${star.left}`} className="absolute" style={{ top: star.top, left: star.left }}>
          <Star size={star.size} />
        </span>
      ))}
      {DOTS.map((dot) => (
        <span
          key={`${dot.top}-${dot.left}`}
          className="border-card-border bg-card absolute size-2.5 rounded-full border-2"
          style={{ top: dot.top, left: dot.left }}
        />
      ))}
    </div>
  )
}

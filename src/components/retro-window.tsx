import { cn } from "@/lib/utils"

export type WindowTone = "coral" | "orange" | "lavender" | "tan"

const BAR: Record<WindowTone, string> = {
  coral: "bg-window-coral",
  orange: "bg-window-orange",
  lavender: "bg-window-lavender",
  tan: "bg-window-tan",
}

/**
 * The three title-bar buttons from the mood boards. Purely decorative: the
 * windows they sit on do not minimise or close, so they are hidden from
 * assistive tech and are not focusable.
 */
export function WindowControls({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <span className="bg-window-coral size-3 rounded-full border-2 border-[#201a3a]" />
      <span className="bg-window-tan size-3 rounded-full border-2 border-[#201a3a]" />
      <span className="bg-window-lavender size-3 rounded-full border-2 border-[#201a3a]" />
    </span>
  )
}

/**
 * A retro desktop window: a coloured title bar with an ink rule, then a cream
 * body with an ink outline and a hard offset shadow.
 *
 * `title` is visible text in the bar. Give `titleAs` a heading level when the
 * title is the section's heading, so the outline of the page stays right.
 */
export function RetroWindow({
  title,
  titleAs: Title = "span",
  tone = "coral",
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  titleAs?: "span" | "h1" | "h2" | "h3"
  tone?: WindowTone
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "border-card-border bg-card text-card-foreground shadow-overlay border-2",
        className
      )}
    >
      <div className={cn("window-bar", BAR[tone])}>
        <WindowControls />
        {title ? (
          <Title className="font-heading min-w-0 truncate text-base font-normal tracking-[0.02em]">
            {title}
          </Title>
        ) : null}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  )
}

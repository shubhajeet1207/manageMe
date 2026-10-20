export function EmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    // An empty folder window from the mood boards: a dashed ink frame on the
    // peach well, with a folder tab drawn above the title.
    <div className="border-card-border bg-well/70 border-2 border-dashed px-6 py-12 text-center">
      <span
        aria-hidden
        className="bg-window-orange relative mx-auto mb-4 block h-9 w-12 border-2 border-[#201a3a] before:absolute before:-top-2.5 before:-left-0.5 before:h-2.5 before:w-5 before:border-2 before:border-b-0 before:border-[#201a3a] before:bg-window-orange"
      />
      <h2 className="font-heading text-lg font-normal tracking-[0.01em]">{title}</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}

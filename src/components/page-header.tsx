export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="border-card-border flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b-2 pb-4">
      <div className="min-w-0">
        {/* The h1's display face comes from globals.css (base layer). */}
        <h1 className="text-3xl leading-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </header>
  )
}

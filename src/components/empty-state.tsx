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
    <div className="border-border bg-well/50 rounded-lg border border-dashed px-6 py-12 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}

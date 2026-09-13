/**
 * One treatment for a short free-text tag, shared by the resume library, the
 * skills editor and the document vault, so the same tag never reads as two
 * different things.
 *
 * Styling is shared; behaviour is not. The resume skills editor is an
 * autosaving, queue-serialising section and document tags are a field inside a
 * form submitted once — rebuilding one around the other's contract would be
 * unrelated work with a real regression risk.
 */
export const tagChipClassName =
  "border-card-border bg-well text-foreground inline-flex items-center gap-1 max-w-full rounded-full border px-2 py-0.5 text-xs leading-5 font-medium"

export function TagChip({ children }: { children: React.ReactNode }) {
  return <span className={tagChipClassName}>{children}</span>
}

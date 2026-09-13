/** One treatment for a skill tag, shared by the library table and the editor
 *  on the detail page, so the same tag never reads as two different things. */
export const skillChipClassName =
  "border-card-border bg-well text-foreground inline-flex items-center gap-1 max-w-full rounded-full border px-2 py-0.5 text-xs leading-5 font-medium"

export function SkillChip({ children }: { children: React.ReactNode }) {
  return <span className={skillChipClassName}>{children}</span>
}

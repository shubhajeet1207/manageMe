import type { QuickDropItem } from "@prisma/client"
import type { TaskOwnerOptions } from "../tasks/task-sheet"
import { QuickDropRow } from "./quick-drop-row"

export function QuickDropList({
  items,
  options,
  tagSuggestions,
}: {
  items: QuickDropItem[]
  options: TaskOwnerOptions
  tagSuggestions: string[]
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <QuickDropRow
          key={item.id}
          item={item}
          options={options}
          tagSuggestions={tagSuggestions}
        />
      ))}
    </ul>
  )
}

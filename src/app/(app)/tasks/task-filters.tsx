"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TaskFilters } from "@/server/repositories/task-repository"
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER, tasksHref } from "./search-params"

// Radix Select forbids an empty item value, so "open" stands in for "no status
// filter" — which is the default list: everything that is not DONE.
const OPEN = "open"

export function TaskFilterBar({
  filters,
  contextLabel,
  doneCount,
}: {
  filters: TaskFilters
  /** Names the project or application the list is narrowed to, so a filtered
   *  list that was arrived at by a link says what it is showing. */
  contextLabel: string | null
  /** How many DONE tasks the default view is hiding right now — completed
   *  work should be discoverable, not just theoretically reachable behind a
   *  filter no one has a reason to open. */
  doneCount: number
}) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.status ?? OPEN}
        onValueChange={(value: string) =>
          router.push(
            tasksHref({
              ...filters,
              ...(value === OPEN ? { status: undefined } : { status: value as never }),
            })
          )
        }
      >
        <SelectTrigger aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OPEN}>Open tasks</SelectItem>
          {TASK_STATUS_ORDER.map((status) => (
            <SelectItem key={status} value={status}>
              {TASK_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {contextLabel ? (
        <Link
          href={tasksHref({ status: filters.status })}
          className="border-card-border bg-well text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:underline"
        >
          {contextLabel}
          <XIcon className="size-3" aria-hidden />
          <span className="sr-only">Clear this filter</span>
        </Link>
      ) : null}

      {doneCount > 0 && filters.status !== "DONE" ? (
        <Link
          href={tasksHref({ ...filters, status: "DONE" })}
          className="border-card-border bg-well text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:underline"
        >
          {doneCount} done
        </Link>
      ) : null}
    </div>
  )
}

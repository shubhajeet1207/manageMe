"use client"

import { useSyncExternalStore } from "react"
import type { TaskWithContext } from "@/server/repositories/task-repository"
import {
  DUE_BUCKET_LABELS,
  DUE_BUCKET_ORDER,
  bucketFor,
  localCalendarDateKey,
  type DueBucket,
} from "./due-date"
import { TaskRow } from "./task-row"
import type { TaskOwnerOptions } from "./task-sheet"

// Nothing to subscribe to: the reader's calendar day is read once per mount,
// and a list that silently re-bucketed itself at midnight under a reader's
// cursor would be worse than one that waits for the next navigation.
const subscribe = () => () => {}
const getSnapshot = () => localCalendarDateKey()
// The server has no business deciding which day "overdue" is measured from, so
// it renders a flat list and this is null there (§7.5).
const getServerSnapshot = () => null

/**
 * "Today" is the READER's today, so the buckets are the client's to draw. The
 * server sorts by ascending due date with nulls last and renders a flat list;
 * after hydration this inserts the group headers, and **no row moves**, because
 * ascending due date is already exactly bucket order. That is why this is not
 * the hydration mismatch the board hit: the client adds to the tree rather than
 * reordering it.
 */
export function TaskList({
  tasks,
  options,
  hideContext = false,
}: {
  tasks: TaskWithContext[]
  options: TaskOwnerOptions
  hideContext?: boolean
}) {
  const todayKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const today = todayKey ? new Date(`${todayKey}T00:00:00.000Z`) : null

  const rows = tasks.map((task) => (
    <TaskRow
      key={task.id}
      task={task}
      options={options}
      today={today}
      hideContext={hideContext}
    />
  ))

  if (!today) {
    return <ul className="space-y-2">{rows}</ul>
  }

  const grouped = new Map<DueBucket, typeof rows>()
  tasks.forEach((task, index) => {
    const bucket = bucketFor(task.dueDate, today)
    const existing = grouped.get(bucket)
    if (existing) existing.push(rows[index])
    else grouped.set(bucket, [rows[index]])
  })

  return (
    <div className="space-y-5">
      {DUE_BUCKET_ORDER.filter((bucket) => grouped.has(bucket)).map((bucket) => (
        <section key={bucket} className="space-y-2">
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-[0.07em] uppercase">
            {DUE_BUCKET_LABELS[bucket]}
          </h2>
          <ul className="space-y-2">{grouped.get(bucket)}</ul>
        </section>
      ))}
    </div>
  )
}

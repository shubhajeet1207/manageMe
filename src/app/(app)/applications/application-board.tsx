"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import { ApplicationStatus } from "@prisma/client"
import { STATUS_ACCENT, STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { ApplicationCard } from "./application-card"
import { changeStatusAction } from "./actions"

function Column({
  status,
  applications,
  companies,
}: {
  status: ApplicationStatus
  applications: ApplicationWithCompany[]
  companies: Pick<Company, "id" | "name">[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const isOutcome = status === "REJECTED"

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={cn(
        "flex w-64 shrink-0 flex-col lg:w-auto lg:min-w-0 lg:shrink",
        isOutcome && "border-border lg:ml-2 lg:border-l lg:pl-3"
      )}
    >
      <div
        className={cn("h-0.5 w-full rounded-full", STATUS_ACCENT[status])}
        aria-hidden
      />
      <header className="flex items-center justify-between gap-2 px-0.5 pt-2.5 pb-2">
        <h2
          className={cn(
            "truncate text-[11px] font-semibold tracking-[0.09em] uppercase",
            isOutcome && "text-muted-foreground"
          )}
        >
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {applications.length}
        </span>
      </header>
      <div
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-1.5 rounded-lg p-1.5 transition-colors",
          isOutcome ? "border-border border border-dashed" : "bg-well",
          isOver && "ring-ring ring-2"
        )}
      >
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            companies={companies}
          />
        ))}
      </div>
    </section>
  )
}

export function ApplicationBoard({
  applications,
  companies,
}: {
  applications: ApplicationWithCompany[]
  companies: Pick<Company, "id" | "name">[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(applications)
  // Re-sync local (optimistic-drag) state when the server-provided prop
  // changes, e.g. after router.refresh() adds/edits an application — done
  // during render (not an effect) per React's "adjusting state when a prop
  // changes" pattern, so it can't race with the optimistic drag update.
  const [prevApplications, setPrevApplications] = useState(applications)
  if (applications !== prevApplications) {
    setPrevApplications(applications)
    setItems(applications)
  }

  const sensors = useSensors(
    // A small distance threshold keeps a plain click from registering as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const applicationId = String(active.id)
    const nextStatus = String(over.id) as ApplicationStatus
    // Only columns are droppable today, but the cast above is unchecked.
    if (!STATUS_ORDER.includes(nextStatus)) return

    const current = items.find((item) => item.id === applicationId)
    if (!current || current.status === nextStatus) return

    const previous = items
    setItems((prev) =>
      prev.map((item) =>
        item.id === applicationId ? { ...item, status: nextStatus } : item
      )
    )

    void changeStatusAction({ id: applicationId, status: nextStatus }).then((result) => {
      if (result.success) {
        router.refresh()
        return
      }
      setItems(previous)
      toast.error(result.formError ?? "Could not move that application.")
    })
  }

  return (
    // `id` is not cosmetic. Without it dnd-kit derives the aria-describedby it
    // stamps on every draggable from useUniqueId, a module-level counter that
    // restarts at 0 on each server render but keeps climbing on the client —
    // so SSR emitted aria-describedby="DndDescribedBy-0" while hydration
    // expected "DndDescribedBy-29", and React logged an attribute hydration
    // mismatch. A literal id short-circuits the counter on both sides.
    <DndContext
      id="application-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
    >
      {/* Seven equal columns from lg up so the whole funnel is visible at once.
          Narrower than that, seven columns would be ~50px each; the board falls
          back to fixed-width columns on a scroller and the table view is the
          better small-screen path. */}
      <div className="flex gap-3 overflow-x-auto pb-3 lg:grid lg:grid-cols-7 lg:gap-2 lg:overflow-x-visible lg:pb-0">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            applications={items.filter((item) => item.status === status)}
            companies={companies}
          />
        ))}
      </div>
    </DndContext>
  )
}

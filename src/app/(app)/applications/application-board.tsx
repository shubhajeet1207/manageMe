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
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
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

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={`bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg p-3 ${
        isOver ? "ring-primary ring-2" : ""
      }`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="text-muted-foreground text-xs">{applications.length}</span>
      </header>
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} companies={companies} />
      ))}
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
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
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

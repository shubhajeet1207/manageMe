"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { ApplicationSheet } from "./application-sheet"

export function ApplicationCard({
  application,
  companies,
}: {
  application: ApplicationWithCompany
  companies: Pick<Company, "id" | "name">[]
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: application.id })

  const label = `${application.company.name} — ${application.roleTitle}`

  return (
    // Keyboard drag and sheet activation live on two different elements on
    // purpose. Both want Enter/Space, and merging them onto one node cannot be
    // made coherent: dnd-kit only preventDefaults the *pickup* keydown, so the
    // drop keypress — and every Space keyup — would still activate the trigger
    // and throw the sheet open mid-drag. Giving the drag its own handle and
    // registering it via setActivatorNodeRef makes dnd-kit's KeyboardSensor
    // ignore keys pressed anywhere else on the card, so neither key ever means
    // two things at once. The pointer listeners stay on the wrapper because
    // PointerSensor does not consult the activator node — the whole card is
    // still draggable with a mouse.
    <article
      ref={setNodeRef}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={cn(
        "bg-card flex w-full cursor-grab items-start gap-2 rounded-md border p-3 text-left shadow-sm active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <ApplicationSheet
        companies={companies}
        application={application}
        trigger={
          <button className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-medium">{application.company.name}</span>
            <span className="text-muted-foreground block text-sm">
              {application.roleTitle}
            </span>
            {application.location ? (
              <span className="text-muted-foreground mt-1 block text-xs">
                {application.location}
              </span>
            ) : null}
          </button>
        }
      />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Reorder ${label}`}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab rounded-sm p-1 active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
    </article>
  )
}

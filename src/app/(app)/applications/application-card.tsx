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
      // PointerSensor has no activator-node guard of its own, and React
      // synthetic events propagate up the *React* tree rather than the DOM
      // tree. ApplicationSheet is a React child of this article but renders
      // its content through a portal, so a pointerdown inside the open sheet —
      // drag-selecting text in the Notes field, say — used to reach this
      // handler and arm the sensor for the card buried under the overlay: the
      // card translated away, the selection was wiped every frame, and mouseup
      // dropped it into whatever column it had wandered over, POSTing a status
      // change nobody asked for. Containment is the exact test, because the
      // portaled content genuinely is not a DOM descendant of this article.
      onPointerDown={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return
        listeners?.onPointerDown?.(event)
      }}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={cn(
        "group/card bg-card border-border hover:border-foreground/20 flex w-full cursor-grab items-start gap-1 rounded-md border px-2 py-1.5 text-left transition-colors active:cursor-grabbing",
        isDragging && "border-ring opacity-70 shadow-lg"
      )}
    >
      <ApplicationSheet
        companies={companies}
        application={application}
        trigger={
          <button className="min-w-0 flex-1 text-left">
            <span className="block text-[13px] leading-snug font-medium break-words">
              {application.company.name}
            </span>
            <span className="text-muted-foreground block text-xs leading-snug break-words">
              {application.roleTitle}
            </span>
            {application.location ? (
              <span className="text-muted-foreground/75 mt-1 block text-[11px] leading-snug break-words">
                {application.location}
              </span>
            ) : null}
          </button>
        }
      />
      <button
        type="button"
        ref={setActivatorNodeRef}
        // Only the keyboard half of the listener map belongs here. The grip is
        // a DOM child of the article, so its pointerdown already bubbles to the
        // wrapper's gated handler; spreading the whole map would run the
        // PointerSensor activator twice for one press.
        onKeyDown={(event) => listeners?.onKeyDown?.(event)}
        {...attributes}
        aria-label={`Reorder ${label}`}
        className="text-muted-foreground/45 hover:text-foreground group-hover/card:text-muted-foreground -mr-0.5 shrink-0 cursor-grab rounded-sm p-0.5 active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5" aria-hidden />
      </button>
    </article>
  )
}

"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { ApplicationSheet } from "./application-sheet"

// ADS draws a raised surface with elevation.shadow.raised and no border at
// all — the shadow's perimeter layer is the edge. A border on top of it reads
// as a doubled outline.
const CARD_SURFACE =
  "bg-card shadow-raised flex w-full items-start gap-1 rounded-md px-2 py-1.5 text-left"

const GRIP = "text-muted-foreground -mr-0.5 shrink-0 rounded-sm p-0.5"

// A ring in the ring colour at full strength, offset against the card it sits
// on: the browser's own focus outline measured 2.08:1 here, well under the 3:1
// SC 1.4.11 asks of a focus indicator.
const FOCUS_RING =
  "focus-visible:ring-ring focus-visible:ring-offset-card rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"

function CardSummary({ application }: { application: ApplicationWithCompany }) {
  return (
    <>
      <span className="block text-[13px] leading-snug font-medium break-words">
        {application.company.name}
      </span>
      <span className="text-muted-foreground block text-xs leading-snug break-words">
        {application.roleTitle}
      </span>
      {application.location ? (
        <span className="text-muted-foreground mt-1 block text-[11px] leading-snug break-words">
          {application.location}
        </span>
      ) : null}
    </>
  )
}

// Rendered inside dnd-kit's <DragOverlay>, which lifts the card out of the
// column and onto a fixed layer above the board. Hidden from assistive tech
// because the real card stays in the tree and dnd-kit narrates the drag through
// its own live region.
export function ApplicationCardOverlay({
  application,
}: {
  application: ApplicationWithCompany
}) {
  return (
    <div
      aria-hidden
      className={cn(CARD_SURFACE, "ring-ring shadow-overlay cursor-grabbing ring-2")}
    >
      <div className="min-w-0 flex-1">
        <CardSummary application={application} />
      </div>
      <span className={GRIP}>
        <GripVerticalIcon className="size-3.5" />
      </span>
    </div>
  )
}

export function ApplicationCard({
  application,
  companies,
}: {
  application: ApplicationWithCompany
  companies: Pick<Company, "id" | "name">[]
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
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
      // No transform here: the dragged card is drawn by <DragOverlay> on the
      // board instead, so what stays behind is a dimmed placeholder rather than
      // a translucent copy sliding across its neighbours.
      className={cn(
        CARD_SURFACE,
        "hover:bg-accent cursor-grab transition-colors active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <ApplicationSheet
        companies={companies}
        application={application}
        trigger={
          <button className={cn("min-w-0 flex-1 text-left", FOCUS_RING)}>
            <CardSummary application={application} />
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
        className={cn(
          GRIP,
          "hover:text-foreground cursor-grab active:cursor-grabbing",
          FOCUS_RING
        )}
      >
        <GripVerticalIcon className="size-3.5" aria-hidden />
      </button>
    </article>
  )
}

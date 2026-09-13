"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { ApplicationSheet } from "./application-sheet"

// ADS leans on elevation.shadow.raised alone for a card's edge, which works
// on Jira's white page and collapses on this board: the shadow's perimeter
// layer measured 1.68:1 against the well in light and 1.09:1 in dark, so the
// card had no findable boundary at all. --card-border keeps ADS's translucent
// border base and raises its alpha until the seam clears 3:1 (globals.css has
// the measurements), and the shadow stays as the depth cue.
const CARD_SURFACE =
  "bg-card border-card-border shadow-raised flex w-full items-start gap-1 rounded-md border px-2 py-1.5 text-left"

const GRIP = "text-muted-foreground -mr-0.5 shrink-0 rounded-sm p-0.5"

// A ring in the ring colour at full strength, offset against the card it sits
// on: the browser's own focus outline measured 2.08:1 here, well under the 3:1
// SC 1.4.11 asks of a focus indicator.
const FOCUS_RING =
  "focus-visible:ring-ring focus-visible:ring-offset-card rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"

// No break-words. A 150px column makes overflow-wrap fire on ordinary words —
// "Manufacturing" split across two lines is not a wrap, it is damage. Left to
// wrap normally the text still breaks at every space, and the one case that
// genuinely cannot fit — a single word longer than the column — is clipped to
// an ellipsis rather than shattered. The whole string stays one tab stop away
// in the sheet, and in the grip's accessible name.
const LINE = "block overflow-hidden leading-snug text-ellipsis"

function CardSummary({ application }: { application: ApplicationWithCompany }) {
  return (
    <>
      <span className={cn(LINE, "text-[13px] font-medium")}>
        {application.company.name}
      </span>
      <span className={cn(LINE, "text-muted-foreground text-xs")}>
        {application.roleTitle}
      </span>
      {application.location ? (
        <span className={cn(LINE, "text-muted-foreground mt-1 text-[11px]")}>
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
      // a translucent copy sliding across its neighbours. Hover lifts the card
      // away from the well rather than into it: the old hover:bg-accent
      // resolved to #F0F1F2, the well's own colour, so in light mode the fill
      // went to 1.00:1 against the column and three sides of the card vanished
      // under the pointer. The border steps up and the shadow goes to overlay
      // instead, which reads as raised in both themes.
      className={cn(
        CARD_SURFACE,
        "hover:bg-card-hovered hover:border-card-border-hovered hover:shadow-overlay cursor-grab transition-[background-color,border-color,box-shadow] active:cursor-grabbing",
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

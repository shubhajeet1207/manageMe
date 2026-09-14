"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import type { ResumeVersionWithResume } from "@/server/repositories/resume-repository"
import { ApplicationSheet } from "./application-sheet"
import type { ApplicationDragData } from "./board-announcements"
import { DeleteApplicationDialog } from "./delete-application-dialog"

// ADS leans on elevation.shadow.raised alone for a card's edge, which works
// on Jira's white page and collapses on this board: the shadow's perimeter
// layer measured 1.68:1 against the well in light and 1.09:1 in dark, so the
// card had no findable boundary at all. --card-border keeps ADS's translucent
// border base and raises its alpha until the seam clears 3:1 (globals.css has
// the measurements), and the shadow stays as the depth cue.
const CARD_SURFACE =
  "bg-card border-card-border shadow-raised flex w-full items-start gap-1 rounded-md border px-2 py-1.5 text-left"

// The -mr-0.5 optical nudge moved to the action column: with a second control
// stacked beneath the grip, nudging only the grip leaves the two right edges
// 2px out of line.
const GRIP = "text-muted-foreground shrink-0 rounded-sm p-0.5"

// A ring in the ring colour at full strength, offset against the card it sits
// on: the browser's own focus outline measured 2.08:1 here, well under the 3:1
// SC 1.4.11 asks of a focus indicator.
const FOCUS_RING =
  "focus-visible:ring-ring focus-visible:ring-offset-card rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"

// DeleteApplicationDialog renders its own trigger, a Button sized for the
// table's action column where h-8 and 14px text are right. A board column is
// ~155px at xl and that trigger eats a third of it — but the dialog is shared
// with the table, so it cannot just be shrunk at the source. The card scales it
// down from outside instead.
//
// `>` rather than a descendant selector is the load-bearing part: the confirm
// dialog's own Cancel/Delete pair are React children of this wrapper, and only
// the fact that they render through a portal — so they are not DOM children —
// keeps them out of a descendant match. Stating the child combinator means the
// modal's buttons stay full size even if that ever stops being true.
const DELETE_TRIGGER =
  "[&>button]:text-muted-foreground [&>button]:hover:text-destructive [&>button]:h-6 [&>button]:rounded-sm [&>button]:px-1.5 [&>button]:text-[11px] [&>button]:font-normal"

/** Company first: it is what the eye and the screen-reader rotor sort on. */
function cardLabel(application: ApplicationWithCompany) {
  return `${application.company.name} — ${application.roleTitle}`
}

type DragHandle = Pick<
  ReturnType<typeof useDraggable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>

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

/**
 * The card's right-hand controls: drag handle above, delete below.
 *
 * Shared with the drag overlay rather than duplicated there because
 * <DragOverlay> hard-codes the lifted layer to the source card's measured
 * width AND height. Content that is a row shorter than the card it replaced
 * does not shrink the layer, it leaves a band of empty card under the grip.
 * One definition means the two cannot drift apart by construction.
 */
function CardActions({
  application,
  label,
  drag,
}: {
  application: ApplicationWithCompany
  label: string
  /** Absent in the overlay twin, which is inert and exists only to be looked at. */
  drag?: DragHandle
}) {
  return (
    <div className="-mr-0.5 flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        ref={drag?.setActivatorNodeRef}
        // Only the keyboard half of the listener map belongs here. The grip is
        // a DOM child of the article, so its pointerdown already bubbles to the
        // wrapper's gated handler; spreading the whole map would run the
        // PointerSensor activator twice for one press.
        onKeyDown={(event) => drag?.listeners?.onKeyDown?.(event)}
        {...drag?.attributes}
        // Not "Reorder": the only thing a drop changes is which stage the
        // application is in. "Reorder" promises a position within a column that
        // the board does not persist, so it described a feature that isn't there.
        aria-label={`Move ${label} to another stage`}
        className={cn(
          GRIP,
          "hover:text-foreground cursor-grab active:cursor-grabbing",
          FOCUS_RING
        )}
      >
        <GripVerticalIcon className="size-3.5" aria-hidden />
      </button>
      {/* Delete used to exist only in the table, so a board-only user had to
          switch views to get rid of anything. The board passes no taskCount:
          the board never loads task counts, and the dialog's default of 0
          simply drops the "n tasks will be unlinked" sentence rather than
          asserting a number nobody counted. */}
      <div className={DELETE_TRIGGER}>
        <DeleteApplicationDialog
          applicationId={application.id}
          // Matches the table's phrasing so the same application produces the
          // same confirm heading whichever view you delete it from.
          label={`${application.roleTitle} at ${application.company.name}`}
        />
      </div>
    </div>
  )
}

// Rendered inside dnd-kit's <DragOverlay>, which lifts the card out of the
// column and onto a fixed layer above the board. The real card stays in the
// tree and dnd-kit narrates the drag through its own live region, so this copy
// must not reach assistive tech — and `inert` rather than `aria-hidden` is what
// does it now that CardActions brings two real buttons along: aria-hidden over
// focusable descendants is the aria-hidden-focus violation, and would also put
// a second Delete for the same application in the tab order on a purely
// decorative layer. inert removes the subtree from both the a11y tree and the
// focus order at once.
export function ApplicationCardOverlay({
  application,
}: {
  application: ApplicationWithCompany
}) {
  return (
    <div
      inert
      className={cn(CARD_SURFACE, "ring-ring shadow-overlay cursor-grabbing ring-2")}
    >
      <div className="min-w-0 flex-1">
        <CardSummary application={application} />
      </div>
      <CardActions application={application} label={cardLabel(application)} />
    </div>
  )
}

export function ApplicationCard({
  application,
  companies,
  versions,
}: {
  application: ApplicationWithCompany
  companies: Pick<Company, "id" | "name">[]
  versions: ResumeVersionWithResume[]
}) {
  const label = cardLabel(application)

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: application.id,
      // Read back by the board's announcements off `active.data.current`.
      data: { label, status: application.status } satisfies ApplicationDragData,
    })

  return (
    // Keyboard drag and sheet activation live on two different elements on
    // purpose. Both want Enter/Space, and merging them onto one node cannot be
    // made coherent: dnd-kit only preventDefaults the *pickup* keydown, so the
    // drop keypress — and every Space keyup — would still activate the trigger
    // and throw the sheet open mid-drag. Giving the drag its own handle and
    // registering it via setActivatorNodeRef makes dnd-kit's KeyboardSensor
    // ignore keys pressed anywhere else on the card, so neither key ever means
    // two things at once. That is also why the delete trigger below is safe to
    // add: KeyboardSensor consults the activator node, so Enter on Delete opens
    // the confirm dialog and cannot start a drag. The pointer listeners stay on
    // the wrapper because PointerSensor does not consult the activator node —
    // the whole card is still draggable with a mouse.
    <article
      ref={setNodeRef}
      // dnd-kit's attributes go on the grip, not here, so this stays a plain
      // article — naming it is what gives the delete trigger, whose accessible
      // name the shared dialog fixes at "Delete", an owning card a screen
      // reader can identify among twenty others.
      aria-label={label}
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
      // The delete confirm dialog is a second portaled surface under this same
      // article, and is covered by the same guard for the same reason.
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
        versions={versions}
        application={application}
        trigger={
          <button className={cn("min-w-0 flex-1 text-left", FOCUS_RING)}>
            <CardSummary application={application} />
          </button>
        }
      />
      <CardActions
        application={application}
        label={label}
        drag={{ attributes, listeners, setActivatorNodeRef }}
      />
    </article>
  )
}

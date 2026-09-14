import type { Active, Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core"
import type { ApplicationStatus } from "@prisma/client"
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"

/**
 * What the board's screen-reader announcements read off the card in the air.
 * ApplicationCard hangs it on its draggable; nothing else writes it.
 *
 * Carried on the draggable rather than looked up by id in the board so that an
 * announcement always describes whatever dnd-kit considers active, and so the
 * descriptors below can live at module scope instead of closing over a
 * useState that changes identity on every optimistic move.
 */
export type ApplicationDragData = {
  label: string
  status: ApplicationStatus
}

/**
 * dnd-kit types `data.current` as freeform, so this cannot be a bare cast: a
 * draggable that forgot its payload has to degrade to silence rather than
 * announce "undefined moved to Interview".
 */
function dragged(active: Active): ApplicationDragData | null {
  const data = active.data.current
  return typeof data?.label === "string" && typeof data.status === "string"
    ? { label: data.label, status: data.status as ApplicationStatus }
    : null
}

/** null for anything that is not one of the board's seven stage columns. */
function dropStage(id: UniqueIdentifier | undefined): ApplicationStatus | null {
  if (id == null) return null
  const status = String(id) as ApplicationStatus
  return STATUS_ORDER.includes(status) ? status : null
}

/**
 * dnd-kit's defaults narrate the mechanism, not the board: "Draggable item
 * cm9x… was moved over droppable area INTERVIEW" is a cuid and an enum. A
 * keyboard user needs the two facts a drag is actually about — which
 * application is in the air, and which stage it would land in. Every id that
 * reaches these strings goes through STATUS_LABELS first, so no announcement
 * can leak a database value.
 *
 * Module scope rather than an object built in render, because DndContext feeds
 * this to a memoised live-region listener that re-subscribes whenever the
 * object's identity changes: a fresh one per render would tear down and
 * re-register the subscription on every arrow key of a keyboard drag.
 */
export const boardAnnouncements: Announcements = {
  onDragStart({ active }) {
    const card = dragged(active)
    if (!card) return undefined
    return `Picked up ${card.label}, currently in ${STATUS_LABELS[card.status]}.`
  },

  onDragOver({ active, over }) {
    const card = dragged(active)
    if (!card) return undefined
    const stage = dropStage(over?.id)
    // The gutters between columns are not droppable, so "over nothing" is a
    // state a keyboard user can sit in and has to be told about — silence
    // there reads as the board having stopped responding to arrow keys.
    return stage
      ? `${card.label} is over ${STATUS_LABELS[stage]}.`
      : `${card.label} is not over a stage.`
  },

  onDragEnd({ active, over }) {
    const card = dragged(active)
    if (!card) return undefined
    // card.status is still the stage the card came FROM. dnd-kit dispatches
    // this to the live region inside the same batched update that runs the
    // board's onDragEnd, so the optimistic setItems has not re-rendered the
    // card — and so has not refreshed this payload — yet. The destination has
    // to come from `over`; reading it off the card announces the old stage.
    const from = STATUS_LABELS[card.status]
    const stage = dropStage(over?.id)
    if (!stage) return `${card.label} was dropped outside the board and stays in ${from}.`
    return stage === card.status
      ? `${card.label} returned to ${from}.`
      : `${card.label} moved to ${STATUS_LABELS[stage]}.`
  },

  onDragCancel({ active }) {
    const card = dragged(active)
    if (!card) return undefined
    return `Cancelled. ${card.label} stays in ${STATUS_LABELS[card.status]}.`
  },
}

// Announced when a drag handle takes focus. The default talks about "a
// draggable item" and "its new position"; here the unit is an application and
// the positions are named stages. The handle gets a mention because it is the
// only element the KeyboardSensor listens on — pressing space anywhere else on
// the card does nothing, which is unguessable without being told.
export const boardScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Press space or enter on this handle to pick the application up. Use the arrow keys to carry it between the board's stages, space or enter again to drop it into the stage you reach, and escape to leave it where it was.",
}

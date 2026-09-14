import { describe, expect, it } from "vitest"
import type { Active, Over } from "@dnd-kit/core"
import {
  boardAnnouncements as sut,
  boardScreenReaderInstructions,
  type ApplicationDragData,
} from "./board-announcements"

// Only `data.current` and `id` are ever read, so the rest of dnd-kit's Active /
// Over shape (measured rects, scroll ancestors) is noise here.
function active(data: ApplicationDragData): Active {
  return { id: "cmfaketestid0001", data: { current: data } } as unknown as Active
}

// dnd-kit types data.current as freeform, so a draggable really can arrive
// carrying anything. `unknown` is the honest parameter type; the happy-path
// helper above stays typed so a payload rename still breaks these tests.
function malformed(data: unknown): Active {
  return { id: "cmfaketestid0001", data: { current: data } } as unknown as Active
}

function over(id: string): Over {
  return { id } as unknown as Over
}

const CARD = active({ label: "Northwind — Staff Engineer", status: "SCREENING" })

// Every string the live region can emit, for the leak assertions below.
function everyAnnouncement(): string[] {
  const targets = [over("INTERVIEW"), over("SCREENING"), over("NOT_A_COLUMN"), undefined]
  return [
    sut.onDragStart({ active: CARD }),
    ...targets.map((target) => sut.onDragOver({ active: CARD, over: target ?? null })),
    ...targets.map((target) => sut.onDragEnd({ active: CARD, over: target ?? null })),
    sut.onDragCancel({ active: CARD, over: null }),
  ].filter((text): text is string => typeof text === "string")
}

describe("boardAnnouncements", () => {
  it("names the application and the stage it came from when picked up", () => {
    expect(sut.onDragStart({ active: CARD })).toBe(
      "Picked up Northwind — Staff Engineer, currently in Screening."
    )
  })

  it("names the stage under the card while it is carried", () => {
    expect(sut.onDragOver({ active: CARD, over: over("INTERVIEW") })).toBe(
      "Northwind — Staff Engineer is over Interview."
    )
  })

  it("says so rather than falling silent when the card is over no column", () => {
    // A keyboard user can park in the gutter between columns. Returning
    // undefined there leaves the last announcement standing, which reads as the
    // board having stopped responding to arrow keys.
    expect(sut.onDragOver({ active: CARD, over: null })).toBe(
      "Northwind — Staff Engineer is not over a stage."
    )
  })

  it("announces the DESTINATION on drop, not the stage the card came from", () => {
    // The regression this exists for: `active.data.current` still holds the
    // pre-drop status when dnd-kit dispatches onDragEnd, so an implementation
    // that reads the stage off the card announces the move that just stopped
    // being true. The destination has to come from `over`.
    expect(sut.onDragEnd({ active: CARD, over: over("INTERVIEW") })).toBe(
      "Northwind — Staff Engineer moved to Interview."
    )
  })

  it("does not claim a move when the card is dropped back where it started", () => {
    expect(sut.onDragEnd({ active: CARD, over: over("SCREENING") })).toBe(
      "Northwind — Staff Engineer returned to Screening."
    )
  })

  it("reports where the card stayed when it is dropped outside the board", () => {
    const text = sut.onDragEnd({ active: CARD, over: null })
    expect(text).toBe(
      "Northwind — Staff Engineer was dropped outside the board and stays in Screening."
    )
    expect(text).not.toMatch(/moved/)
  })

  it("names the stage the card stays in when the drag is cancelled", () => {
    expect(sut.onDragCancel({ active: CARD, over: null })).toBe(
      "Cancelled. Northwind — Staff Engineer stays in Screening."
    )
  })

  it("treats a droppable that is not a stage column as no destination", () => {
    // Only columns are droppable today. If that ever stops being true, the
    // announcement must not invent "moved to undefined".
    for (const text of [
      sut.onDragOver({ active: CARD, over: over("NOT_A_COLUMN") }),
      sut.onDragEnd({ active: CARD, over: over("NOT_A_COLUMN") }),
    ]) {
      expect(text).not.toMatch(/undefined/)
      expect(text).toMatch(/not over a stage|stays in Screening/)
    }
  })

  it("never leaks a raw status enum or a record id into the live region", () => {
    const texts = everyAnnouncement()
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      // "INTERVIEW"/"SCREENING" rather than "Interview"/"Screening", and the
      // cuid, are exactly what dnd-kit's defaults announce. Any of them
      // reappearing means a label lookup was skipped.
      expect(text).not.toMatch(/[A-Z]{4,}/)
      expect(text).not.toContain("cmfaketestid0001")
    }
  })

  it("stays silent for a draggable carrying no payload", () => {
    // Better nothing than "undefined moved to Interview".
    for (const broken of [undefined, {}, { label: "Northwind" }, { status: "OFFER" }]) {
      expect(sut.onDragStart({ active: malformed(broken) })).toBeUndefined()
      expect(
        sut.onDragEnd({ active: malformed(broken), over: over("INTERVIEW") })
      ).toBeUndefined()
    }
  })
})

describe("boardScreenReaderInstructions", () => {
  it("describes the handle and the stages, not dnd-kit's generic item", () => {
    const { draggable } = boardScreenReaderInstructions
    // The KeyboardSensor listens only on the grip, so "press space" without
    // saying where is unfollowable advice.
    expect(draggable).toMatch(/handle/i)
    expect(draggable).toMatch(/stage/i)
    expect(draggable).toMatch(/escape/i)
    expect(draggable).not.toMatch(/draggable item/i)
  })
})

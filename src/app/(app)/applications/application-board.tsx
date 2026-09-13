"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import { ApplicationStatus } from "@prisma/client"
import { STATUS_ACCENT, STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import type { ResumeVersionWithResume } from "@/server/repositories/resume-repository"
import { ApplicationCard, ApplicationCardOverlay } from "./application-card"
import { changeStatusAction } from "./actions"

function Column({
  status,
  applications,
  companies,
  versions,
}: {
  status: ApplicationStatus
  applications: ApplicationWithCompany[]
  companies: Pick<Company, "id" | "name">[]
  versions: ResumeVersionWithResume[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const isOutcome = status === "REJECTED"

  return (
    // The accent rule and the header sit outside the scrolling body, so from xl
    // up — where the board is a fixed-height grid — a column's cards scroll
    // under a header that never moves.
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className="flex w-64 shrink-0 flex-col xl:w-auto xl:min-w-0 xl:shrink"
    >
      <div
        className={cn("h-[3px] w-full shrink-0 rounded-full", STATUS_ACCENT[status])}
        aria-hidden
      />
      <header className="flex shrink-0 items-center justify-between gap-2 px-0.5 pt-2.5 pb-2">
        <h2
          className={cn(
            "truncate text-[11px] font-semibold tracking-[0.09em] uppercase",
            isOutcome && "text-muted-foreground"
          )}
        >
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-subtlest shrink-0 text-[11px] tabular-nums">
          {applications.length}
        </span>
      </header>
      <div
        className={cn(
          "scroll-rail flex min-h-24 flex-1 flex-col gap-1.5 rounded-lg p-1.5 transition-colors xl:min-h-0 xl:overflow-y-auto",
          isOutcome ? "border-border border border-dashed" : "bg-well",
          isOver && "ring-ring ring-2"
        )}
      >
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            companies={companies}
            versions={versions}
          />
        ))}
      </div>
    </section>
  )
}

export function ApplicationBoard({
  applications,
  companies,
  versions,
}: {
  applications: ApplicationWithCompany[]
  companies: Pick<Company, "id" | "name">[]
  versions: ResumeVersionWithResume[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(applications)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Re-sync local (optimistic-drag) state when the server-provided prop
  // changes, e.g. after router.refresh() adds/edits an application — done
  // during render (not an effect) per React's "adjusting state when a prop
  // changes" pattern, so it can't race with the optimistic drag update.
  const [prevApplications, setPrevApplications] = useState(applications)
  if (applications !== prevApplications) {
    setPrevApplications(applications)
    setItems(applications)
  }

  const scrollerRef = useRef<HTMLDivElement>(null)
  // Which way the hidden columns lie. Below xl the board is a strip showing
  // 2.5 of 7 columns, and macOS overlay scrollbars leave no standing hint that
  // the other four exist; these drive a fade on whichever edge has more board
  // behind it.
  const [overflowing, setOverflowing] = useState({ left: false, right: false })

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const update = () =>
      setOverflowing({
        left: scroller.scrollLeft > 1,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
      })
    update()
    scroller.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [items])

  const sensors = useSensors(
    // A small distance threshold keeps a plain click from registering as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const activeApplication = activeId
    ? (items.find((item) => item.id === activeId) ?? null)
    : null

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
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
    // The wrapper is load-bearing: DndContext renders two hidden accessibility
    // nodes as its last children, and as direct children of the page's
    // space-y-6 stack each one picked up a 24px margin — 24px of phantom page
    // below a board that is supposed to end exactly at the window's edge.
    <div className="relative">
      {/* `id` is not cosmetic. Without it dnd-kit derives the aria-describedby
          it stamps on every draggable from useUniqueId, a module-level counter
          that restarts at 0 on each server render but keeps climbing on the
          client — so SSR emitted aria-describedby="DndDescribedBy-0" while
          hydration expected "DndDescribedBy-29", and React logged an attribute
          hydration mismatch. A literal id short-circuits the counter on both
          sides. */}
      <DndContext
        id="application-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Seven equal columns from xl up so the whole funnel is visible at
            once. Below 1280px seven columns are under ~130px each and card
            titles start breaking mid-word, so the board falls back to
            fixed-width columns on a scroller and the table view is the better
            small-screen path.

            The eighth track is the outcome divider. It used to be ml/border/pl
            on the Rejected column itself, which ate 21px out of an equal 1fr
            track and left that lane 147px against its neighbours' 155px at
            1440; giving the rule its own track buys the separation out of the
            board's width instead of out of one column's.

            The height is the viewport minus the 12.3125rem of chrome around
            it: the 3.5rem topbar, 1.5rem of page padding above and below, the
            4.3125rem page header block and the 1.5rem under it. The board then
            ends where the window does, and each column scrolls its own cards
            past a header that stays put. */}
        <div
          ref={scrollerRef}
          className="scroll-rail flex gap-3 overflow-x-auto pb-3 xl:grid xl:h-[calc(100dvh-12.3125rem)] xl:grid-cols-[repeat(6,minmax(0,1fr))_auto_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-2 xl:overflow-x-visible xl:pb-0"
        >
          {STATUS_ORDER.map((status) => (
            <Fragment key={status}>
              {status === "REJECTED" ? (
                <div aria-hidden className="bg-border hidden w-px xl:mx-0.5 xl:block" />
              ) : null}
              <Column
                status={status}
                applications={items.filter((item) => item.status === status)}
                companies={companies}
                versions={versions}
              />
            </Fragment>
          ))}
        </div>
        <DragOverlay>
          {activeApplication ? (
            <ApplicationCardOverlay application={activeApplication} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Below xl the board is a strip showing two and a half of seven
          columns. A fade on whichever side still has board behind it is the
          only standing sign that the other four exist — macOS overlay
          scrollbars appear on scroll, which is too late to be an invitation. */}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          data-scroll-fade={side}
          className={cn(
            "pointer-events-none absolute inset-y-0 z-10 w-8 transition-opacity xl:hidden",
            side === "left"
              ? "from-background left-0 bg-gradient-to-r to-transparent"
              : "from-background right-0 bg-gradient-to-l to-transparent",
            overflowing[side] ? "opacity-100" : "opacity-0"
          )}
        />
      ))}
    </div>
  )
}

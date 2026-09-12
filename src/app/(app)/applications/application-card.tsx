"use client"

import { useDraggable } from "@dnd-kit/core"
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
  })

  return (
    <ApplicationSheet
      companies={companies}
      application={application}
      trigger={
        <article
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          style={{
            transform: transform
              ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
              : undefined,
          }}
          className={cn(
            "bg-card block w-full cursor-grab rounded-md border p-3 text-left shadow-sm active:cursor-grabbing",
            isDragging && "opacity-50"
          )}
        >
          <p className="text-sm font-medium">{application.company.name}</p>
          <p className="text-muted-foreground text-sm">{application.roleTitle}</p>
          {application.location ? (
            <p className="text-muted-foreground mt-1 text-xs">{application.location}</p>
          ) : null}
        </article>
      }
    />
  )
}

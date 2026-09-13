"use client"

import { MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function TriageMenu({
  content,
  canBeLink,
  onTriage,
  onDismiss,
}: {
  content: string
  /** Link is offered only when the content is an http/https URL — there is
   *  nothing to save otherwise. */
  canBeLink: boolean
  onTriage: (target: "task" | "link" | "project") => void
  onDismiss: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label={`Triage “${content}”`}>
            Triage
            <MoreHorizontalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onTriage("task")}>Make a task</DropdownMenuItem>
        {canBeLink ? (
          <DropdownMenuItem onClick={() => onTriage("link")}>Save as a link</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onTriage("project")}>Start a project</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* The one irreversible option, so it is the one behind a dialog. */}
        <DropdownMenuItem variant="destructive" onClick={onDismiss}>
          Dismiss
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

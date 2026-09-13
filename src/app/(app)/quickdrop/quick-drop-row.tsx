"use client"

import { useState } from "react"
import { isHttpUrl } from "@/server/validators/url"
import type { QuickDropItem } from "@prisma/client"
import type { TaskOwnerOptions } from "../tasks/task-sheet"
import { TaskSheet } from "../tasks/task-sheet"
import { LinkSheet } from "../links/link-sheet"
import { ProjectSheet } from "../projects/project-sheet"
import { formatDate } from "../resumes/format"
import { DismissQuickDropDialog } from "./dismiss-quick-drop-dialog"
import { TriageMenu } from "./triage-menu"

export function QuickDropRow({
  item,
  options,
  tagSuggestions,
}: {
  item: QuickDropItem
  options: TaskOwnerOptions
  tagSuggestions: string[]
}) {
  const [triage, setTriage] = useState<"task" | "link" | "project" | null>(null)
  const [dismissing, setDismissing] = useState(false)

  // Rendered as an anchor ONLY when it parses as an http/https URL — the same
  // control the link schema applies, on a field no schema validated as a URL.
  // A free-text field rendered as a link without it is the `javascript:` hole
  // in a different shirt.
  const isUrl = isHttpUrl(item.content)

  return (
    <li className="border-card-border bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        {isUrl ? (
          <a
            href={item.content}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm leading-5 [overflow-wrap:anywhere] hover:underline"
          >
            {item.content}
          </a>
        ) : (
          <p className="text-sm leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {item.content}
          </p>
        )}
        <p className="text-muted-foreground text-xs tabular-nums">
          <time dateTime={item.createdAt.toISOString()}>{formatDate(item.createdAt)}</time>
        </p>
      </div>

      <TriageMenu
        content={item.content}
        canBeLink={isUrl}
        onTriage={setTriage}
        onDismiss={() => setDismissing(true)}
      />

      {triage === "task" ? (
        <TaskSheet
          options={options}
          defaultTitle={item.content}
          quickDropItemId={item.id}
          open
          onOpenChange={(next) => setTriage(next ? "task" : null)}
        />
      ) : null}

      {triage === "link" ? (
        <LinkSheet
          defaultUrl={item.content}
          suggestions={tagSuggestions}
          quickDropItemId={item.id}
          open
          onOpenChange={(next) => setTriage(next ? "link" : null)}
        />
      ) : null}

      {triage === "project" ? (
        <ProjectSheet
          defaultName={item.content}
          defaultStatus="IDEA"
          quickDropItemId={item.id}
          open
          onOpenChange={(next) => setTriage(next ? "project" : null)}
        />
      ) : null}

      <DismissQuickDropDialog
        itemId={item.id}
        content={item.content}
        open={dismissing}
        onOpenChange={setDismissing}
      />
    </li>
  )
}

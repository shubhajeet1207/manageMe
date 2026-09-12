import { ApplicationStatus } from "@prisma/client"
import { STATUS_ORDER } from "@/components/status-badge"

export type ApplicationView = "board" | "table"

export function parseView(value: string | undefined): ApplicationView {
  return value === "table" ? "table" : "board"
}

export function parseStatus(value: string | undefined): ApplicationStatus | null {
  // `value in ApplicationStatus` walks the prototype chain, so inherited
  // names like "toString" or "constructor" pass as if they were real
  // statuses. Check membership in the actual value list instead.
  if (value && STATUS_ORDER.includes(value as ApplicationStatus)) return value as ApplicationStatus
  return null
}

// Every control on the page builds its target through this, so changing one
// param can never drop the other.
export function applicationsHref({
  view,
  status,
}: {
  view: ApplicationView
  status: ApplicationStatus | null
}) {
  const params = new URLSearchParams({ view })
  if (status) params.set("status", status)
  return `/applications?${params.toString()}`
}

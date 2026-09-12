import { ApplicationStatus } from "@prisma/client"

export type ApplicationView = "board" | "table"

export function parseView(value: string | undefined): ApplicationView {
  return value === "table" ? "table" : "board"
}

export function parseStatus(value: string | undefined): ApplicationStatus | null {
  if (value && value in ApplicationStatus) return value as ApplicationStatus
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

"use client"

import { useRouter } from "next/navigation"
import { ApplicationStatus } from "@prisma/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import { applicationsHref, type ApplicationView } from "./search-params"

// Radix Select forbids an empty item value, so "all" stands in for "no filter"
// and is translated back to an absent ?status= on navigation.
const ALL = "all"

export function StatusFilter({
  status,
  view,
}: {
  status: ApplicationStatus | null
  view: ApplicationView
}) {
  const router = useRouter()

  return (
    <Select
      value={status ?? ALL}
      onValueChange={(value) =>
        router.push(
          applicationsHref({
            view,
            status: value === ALL ? null : (value as ApplicationStatus),
          })
        )
      }
    >
      <SelectTrigger aria-label="Filter by status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All statuses</SelectItem>
        {STATUS_ORDER.map((value) => (
          <SelectItem key={value} value={value}>
            {STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

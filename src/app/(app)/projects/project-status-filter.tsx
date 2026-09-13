"use client"

import { useRouter } from "next/navigation"
import { ProjectStatus } from "@prisma/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "./project-status"

// Radix Select forbids an empty item value, so "all" stands in for "no filter"
// and is translated back to an absent ?status= on navigation.
const ALL = "all"

export function ProjectStatusFilter({ status }: { status: ProjectStatus | null }) {
  const router = useRouter()

  return (
    <Select
      value={status ?? ALL}
      onValueChange={(value: string) =>
        router.push(value === ALL ? "/projects" : `/projects?status=${value}`)
      }
    >
      <SelectTrigger aria-label="Filter by status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All statuses</SelectItem>
        {PROJECT_STATUS_ORDER.map((value) => (
          <SelectItem key={value} value={value}>
            {PROJECT_STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

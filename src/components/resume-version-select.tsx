"use client"

import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ResumeVersionWithResume } from "@/server/repositories/resume-repository"

/**
 * Radix reserves the empty string to clear a select, so "None" carries a
 * sentinel and the caller maps it back to "" — which the schema transforms to
 * undefined, saving a cleared field as null rather than as "".
 */
export const NO_RESUME_VERSION = "__none__"

/** Options are VERSIONS, grouped by their slot: the user picks the file that
 *  was sent, and the grouping says which slot it came from. */
function groupByResume(versions: ResumeVersionWithResume[]) {
  const groups: { resumeId: string; resumeName: string; versions: ResumeVersionWithResume[] }[] = []
  for (const version of versions) {
    const last = groups.at(-1)
    if (last?.resumeId === version.resumeId) last.versions.push(version)
    else
      groups.push({
        resumeId: version.resumeId,
        resumeName: version.resume.name,
        versions: [version],
      })
  }
  return groups
}

export function ResumeVersionSelect({
  versions,
  value,
  onChangeValue,
}: {
  versions: ResumeVersionWithResume[]
  value: string
  onChangeValue: (value: string) => void
}) {
  if (versions.length === 0) {
    return (
      <div className="space-y-2">
        <Select disabled value={NO_RESUME_VERSION} onValueChange={onChangeValue}>
          <SelectTrigger aria-label="Resume" className="w-full">
            <SelectValue placeholder="No resumes yet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RESUME_VERSION}>None</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          Upload a resume in{" "}
          <Link href="/resumes" className="underline">
            Resumes
          </Link>{" "}
          to link one here.
        </p>
      </div>
    )
  }

  return (
    <Select value={value || NO_RESUME_VERSION} onValueChange={onChangeValue}>
      <SelectTrigger aria-label="Resume" className="w-full">
        <SelectValue placeholder="None" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_RESUME_VERSION}>None</SelectItem>
        {groupByResume(versions).map((group) => (
          <SelectGroup key={group.resumeId}>
            <SelectLabel>{group.resumeName}</SelectLabel>
            {group.versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {version.label} · {version.createdAt.toISOString().slice(0, 10)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

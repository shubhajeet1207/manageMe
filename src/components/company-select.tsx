"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Company } from "@prisma/client"

export const NEW_COMPANY = "__new__"

/**
 * Radix reserves the empty string to clear a select, so "None" carries a
 * sentinel and the caller maps it back to "" — which the schema transforms to
 * undefined, saving a cleared field as null rather than as "". The same shape
 * as `NO_RESUME_VERSION`.
 */
export const NO_COMPANY = "__none__"

export function CompanySelect({
  companies,
  value,
  newName,
  onChangeValue,
  onChangeNewName,
  allowNone = false,
  allowNew = true,
  triggerClassName,
}: {
  companies: Pick<Company, "id" | "name">[]
  value: string
  newName: string
  onChangeValue: (value: string) => void
  onChangeNewName: (value: string) => void
  /** An application without a company is not an application; a document
   *  without one is just a document. Off by default, so the application sheet
   *  is unchanged. */
  allowNone?: boolean
  /** Creating a company mid-form is the application flow's affordance. The
   *  vault files against companies that already exist. */
  allowNew?: boolean
  /** The trigger is `w-fit` by default, which is what the application sheet
   *  has always rendered. Passed rather than changed. */
  triggerClassName?: string
}) {
  return (
    <div className="space-y-2">
      <Select value={value || (allowNone ? NO_COMPANY : "")} onValueChange={onChangeValue}>
        <SelectTrigger aria-label="Company" className={triggerClassName}>
          <SelectValue placeholder={allowNone ? "No company" : "Select a company"} />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NO_COMPANY}>No company</SelectItem> : null}
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
          {allowNew ? <SelectItem value={NEW_COMPANY}>+ New company</SelectItem> : null}
        </SelectContent>
      </Select>

      {value === NEW_COMPANY ? (
        <Input
          aria-label="New company name"
          placeholder="Company name"
          value={newName}
          onChange={(event) => onChangeNewName(event.target.value)}
        />
      ) : null}
    </div>
  )
}

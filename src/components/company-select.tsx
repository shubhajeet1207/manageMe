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

export function CompanySelect({
  companies,
  value,
  newName,
  onChangeValue,
  onChangeNewName,
}: {
  companies: Pick<Company, "id" | "name">[]
  value: string
  newName: string
  onChangeValue: (value: string) => void
  onChangeNewName: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChangeValue}>
        <SelectTrigger aria-label="Company">
          <SelectValue placeholder="Select a company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW_COMPANY}>+ New company</SelectItem>
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

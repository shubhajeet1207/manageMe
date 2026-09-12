import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"

function formatSalary(app: ApplicationWithCompany) {
  if (app.salaryMin == null && app.salaryMax == null) return "—"
  const currency = app.currency ? `${app.currency} ` : ""
  if (app.salaryMin != null && app.salaryMax != null) {
    return `${currency}${app.salaryMin.toLocaleString()}–${app.salaryMax.toLocaleString()}`
  }
  const single = app.salaryMin ?? app.salaryMax
  return `${currency}${single!.toLocaleString()}`
}

export function ApplicationTable({
  applications,
}: {
  applications: ApplicationWithCompany[]
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Salary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id}>
              <TableCell className="font-medium">
                <Link href={`/companies/${app.companyId}`} className="hover:underline">
                  {app.company.name}
                </Link>
              </TableCell>
              <TableCell>{app.roleTitle}</TableCell>
              <TableCell>
                <StatusBadge status={app.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{app.location ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {app.appliedAt ? app.appliedAt.toISOString().slice(0, 10) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatSalary(app)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

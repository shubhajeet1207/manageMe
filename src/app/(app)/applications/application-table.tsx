import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { ApplicationSheet } from "./application-sheet"
import { DeleteApplicationDialog } from "./delete-application-dialog"

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
  companies = [],
}: {
  applications: ApplicationWithCompany[]
  companies?: Pick<Company, "id" | "name">[]
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
            <TableHead className="w-40 text-right">Actions</TableHead>
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
              <TableCell className="text-right">
                <ApplicationSheet
                  companies={companies}
                  application={app}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteApplicationDialog
                  applicationId={app.id}
                  label={`${app.roleTitle} at ${app.company.name}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

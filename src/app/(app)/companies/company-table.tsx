import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CompanyWithCount } from "@/server/repositories/company-repository"
import { CompanySheet } from "./company-sheet"
import { DeleteCompanyDialog } from "./delete-company-dialog"

export function CompanyTable({ companies }: { companies: CompanyWithCount[] }) {
  return (
    <div className="border-border bg-card overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Name</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Applications</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium">
                <Link href={`/companies/${company.id}`} className="hover:underline">
                  {company.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:underline"
                  >
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{company.location ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {company._count.applications}
              </TableCell>
              <TableCell className="text-right">
                <CompanySheet
                  company={company}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteCompanyDialog companyId={company.id} companyName={company.name} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

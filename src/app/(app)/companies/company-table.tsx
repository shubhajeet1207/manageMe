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
import type {
  CompanyStats,
  CompanyWithCount,
} from "@/server/repositories/company-repository"
import { emptyCompanyStats } from "@/server/repositories/company-repository"
import { formatDate } from "@/app/(app)/documents/format"
import { CompanySheet } from "./company-sheet"
import { DeleteCompanyDialog } from "./delete-company-dialog"

export function CompanyTable({
  companies,
  stats,
}: {
  companies: CompanyWithCount[]
  /** Keyed by company id. Companies nobody has applied to are absent — see
   *  `statsByCompany` — so every lookup falls back to an empty row. */
  stats: Map<string, CompanyStats>
}) {
  return (
    // Same single-scroller frame as the applications table: the inner
    // container's overflow is neutralised so the bordered frame is the one
    // thing that scrolls, and below lg the table holds a readable strip and
    // scrolls instead of crushing eight columns into a phone.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[1080px] lg:min-w-[960px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Name</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Applications</TableHead>
            {/* The two labels are the dashboard's, word for word. "Now at" and
                "Ever reached" are different claims about the same seven
                stages, and a column called "Interviews" would collapse them
                into one wrong number. */}
            <TableHead className="w-28 text-right">Now at interview or better</TableHead>
            <TableHead className="w-28 text-right">Ever reached interview</TableHead>
            <TableHead className="xl:w-28">Last activity</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => {
            const companyStats = stats.get(company.id) ?? emptyCompanyStats()
            return (
              <TableRow key={company.id} className="[&>td]:px-3 [&>td]:py-1.5">
                <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                  <Link href={`/companies/${company.id}`} className="hover:underline">
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
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
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                  {company.location ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {company._count.applications}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {companyStats.nowAtInterviewOrBetter}
                </TableCell>
                {/* A dash, never a zero: with nothing recorded against this
                    company, a 0 would assert that no application ever reached
                    interview when in fact nothing was watching. */}
                <TableCell className="text-right tabular-nums">
                  {companyStats.everReachedInterview ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {companyStats.lastActivityAt ? formatDate(companyStats.lastActivityAt) : "—"}
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
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

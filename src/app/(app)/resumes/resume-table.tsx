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
import type { ResumeLibraryItem } from "@/server/services/resume-service"
import { DeleteResumeDialog } from "./delete-resume-dialog"
import { formatDate } from "./format"
import { ResumeSheet } from "./resume-sheet"
import { SkillChip } from "./skill-chip"

/** Enough to recognise a slot by — "this is the Go and Kubernetes one" —
 *  without the column becoming the row. The rest are counted, and named in the
 *  count's tooltip. */
const VISIBLE_SKILLS = 3

export function ResumeTable({ resumes }: { resumes: ResumeLibraryItem[] }) {
  return (
    // The same single-scroller frame as /companies: the inner container's
    // overflow is neutralised so the bordered frame is the one thing that
    // scrolls, and below lg the table keeps a readable strip rather than
    // crushing seven columns into a phone.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[1000px] lg:min-w-[860px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Name</TableHead>
            <TableHead>Skills</TableHead>
            <TableHead>Current version</TableHead>
            <TableHead className="text-right">Versions</TableHead>
            <TableHead className="text-right">Used by</TableHead>
            <TableHead className="xl:w-28">Updated</TableHead>
            <TableHead className="w-36 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resumes.map((resume) => (
            <TableRow key={resume.id} className="[&>td]:px-3 [&>td]:py-1.5">
              <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                <Link href={`/resumes/${resume.id}`} className="hover:underline">
                  {resume.name}
                </Link>
              </TableCell>
              <TableCell className="whitespace-normal">
                {resume.skills.length === 0 ? (
                  <span className="text-muted-foreground">&mdash;</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1">
                    {resume.skills.slice(0, VISIBLE_SKILLS).map((skill) => (
                      <SkillChip key={skill}>{skill}</SkillChip>
                    ))}
                    {resume.skills.length > VISIBLE_SKILLS ? (
                      <span
                        className="text-muted-foreground text-xs tabular-nums"
                        title={resume.skills.slice(VISIBLE_SKILLS).join(", ")}
                      >
                        +{resume.skills.length - VISIBLE_SKILLS}
                      </span>
                    ) : null}
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                {resume.currentVersion ? (
                  <span>
                    {resume.currentVersion.label}{" "}
                    <span className="text-muted-foreground whitespace-nowrap [overflow-wrap:normal] tabular-nums">
                      · {formatDate(resume.currentVersion.createdAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No versions yet</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{resume._count.versions}</TableCell>
              <TableCell className="text-right tabular-nums">
                {resume.stats.applications}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDate(resume.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <ResumeSheet
                  resume={resume}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteResumeDialog resumeId={resume.id} resumeName={resume.name} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

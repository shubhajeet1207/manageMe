import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CredentialSummary } from "@/server/repositories/credential-repository"
import { formatDate } from "../resumes/format"
import { CopyUsernameButton } from "./copy-username-button"
import { CredentialSheet } from "./credential-sheet"
import { DeleteCredentialDialog } from "./delete-credential-dialog"
import { RevealCredentialDialog } from "./reveal-credential-dialog"

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function CredentialTable({
  credentials,
  keyConfigured,
  readableKeyIds,
}: {
  credentials: CredentialSummary[]
  keyConfigured: boolean
  /** Which keys this process can actually open. A row encrypted under a key
   *  that is gone is marked rather than shown blank — a blank field would read
   *  as "there is no password here", which is the wrong thing to believe. */
  readableKeyIds: string[]
}) {
  return (
    // There is no password column and no row of dots: a row of dots on a page
    // whose HTML does not contain the password is a small lie, and the button
    // says what actually happens.
    <div className="border-card-border bg-card scroll-rail overflow-x-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-visible">
      <Table className="min-w-[820px] lg:min-w-[640px]">
        <TableHeader className="bg-well/70">
          <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.07em] [&>th]:uppercase">
            <TableHead>Label</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Username</TableHead>
            <TableHead className="text-right">Password updated</TableHead>
            <TableHead className="w-52 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {credentials.map((credential) => {
            const readable = readableKeyIds.includes(credential.keyId)
            return (
              <TableRow key={credential.id} className="[&>td]:px-3 [&>td]:py-1.5">
                <TableCell className="font-medium whitespace-normal [overflow-wrap:anywhere]">
                  {credential.label}
                  {keyConfigured && !readable ? (
                    <p className="text-destructive mt-0.5 text-xs font-normal">
                      This password was encrypted with a key that isn&apos;t configured here.
                      Restore the CREDENTIALS_KEY it was sealed under, or delete this record.
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                  {credential.siteUrl ? (
                    <a
                      href={credential.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {hostOf(credential.siteUrl)}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]">
                  {credential.username ? (
                    <span className="inline-flex items-center gap-1">
                      {credential.username}
                      <CopyUsernameButton username={credential.username} />
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatDate(credential.secretUpdatedAt)}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <RevealCredentialDialog
                    credentialId={credential.id}
                    label={credential.label}
                    disabled={!keyConfigured || !readable}
                    disabledReason={
                      keyConfigured
                        ? "This record's key is not available."
                        : "CREDENTIALS_KEY is not set."
                    }
                  />
                  <CredentialSheet
                    credential={credential}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <DeleteCredentialDialog
                    credentialId={credential.id}
                    label={credential.label}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import {
  getVaultStatus,
  listCredentials,
  listReadableKeyIds,
} from "@/server/services/credential-service"
import { CredentialSheet } from "./credential-sheet"
import { CredentialTable } from "./credential-table"
import { ReencryptButton } from "./reencrypt-button"

const VAULT_SCOPE =
  "For your own low-stakes third-party logins — the account you made for a company's portal because you had to. Not for banking, work accounts, or anything shared with another person."

function Banner({
  tone,
  children,
}: {
  tone: "warning" | "danger"
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={
        tone === "danger"
          ? "border-destructive/40 bg-destructive/5 text-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
          : "border-card-border bg-well text-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
      }
    >
      {children}
    </div>
  )
}

export default async function CredentialsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id
  // The list renders whether or not the key is configured: listing labels,
  // sites and usernames needs no key, and taking the page away tells the user
  // less than showing them what is in the vault (§9.4).
  const [credentials, status] = await Promise.all([
    listCredentials(userId),
    getVaultStatus(userId),
  ])
  const readableKeyIds = listReadableKeyIds()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credentials"
        description="Logins for the job portals you had to sign up to. Encrypted at rest; revealed only when you confirm your account password."
      >
        <CredentialSheet trigger={<Button>Save a credential</Button>} />
      </PageHeader>

      {!status.keyConfigured ? (
        <Banner tone="danger">
          <span>
            Credential storage isn&apos;t configured. Set <code>CREDENTIALS_KEY</code> to a
            base64 string of 32 random bytes. Existing records are listed but cannot be read or
            changed.
          </span>
        </Banner>
      ) : null}

      {status.unreadable > 0 ? (
        <Banner tone="danger">
          <span>
            {status.unreadable} password{status.unreadable === 1 ? "" : "s"} cannot be read with
            the keys this app has. Restore the previous <code>CREDENTIALS_KEY</code>, or delete
            those records.
          </span>
        </Banner>
      ) : null}

      {status.needingReencryption > status.unreadable ? (
        <Banner tone="warning">
          <span>
            {status.needingReencryption - status.unreadable} password
            {status.needingReencryption - status.unreadable === 1 ? " is" : "s are"} still
            encrypted with the previous key.
          </span>
          <ReencryptButton count={status.needingReencryption - status.unreadable} />
        </Banner>
      ) : null}

      {credentials.length === 0 ? (
        <EmptyState title="Nothing saved yet" description={VAULT_SCOPE}>
          <CredentialSheet trigger={<Button>Save your first credential</Button>} />
        </EmptyState>
      ) : (
        <>
          <CredentialTable
            credentials={credentials}
            keyConfigured={status.keyConfigured}
            readableKeyIds={readableKeyIds}
          />
          <p className="text-muted-foreground max-w-3xl text-xs">{VAULT_SCOPE}</p>
        </>
      )}
    </div>
  )
}

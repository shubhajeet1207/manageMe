import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listCompanies } from "@/server/services/company-service"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { CompanySheet } from "./company-sheet"
import { CompanyTable } from "./company-table"

export default async function CompaniesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const companies = await listCompanies(session.user.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Every company you are tracking, and how many applications you have with each."
      >
        <CompanySheet trigger={<Button>Add company</Button>} />
      </PageHeader>

      {companies.length === 0 ? (
        <EmptyState
          title="No companies yet"
          description="Companies are created automatically when you add an application, or you can add one here first."
        >
          <CompanySheet trigger={<Button>Add your first company</Button>} />
        </EmptyState>
      ) : (
        <CompanyTable companies={companies} />
      )}
    </div>
  )
}

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listCompanies } from "@/server/services/company-service"
import { CompanyTable } from "./company-table"

export default async function CompaniesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const companies = await listCompanies(session.user.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every company you are tracking, and how many applications you have with each.
          </p>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <h2 className="font-medium">No companies yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Companies are created automatically when you add an application, or you can add one
            here first.
          </p>
        </div>
      ) : (
        <CompanyTable companies={companies} />
      )}
    </div>
  )
}

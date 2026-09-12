import Link from "next/link"
import { Button } from "@/components/ui/button"

// Reached both when no such company exists and when it belongs to someone else.
// The copy must stay neutral: a message that hinted the record exists would turn
// this page into a probe for other users' data.
export default function CompanyNotFound() {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <h1 className="font-medium">Company not found</h1>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
        We could not find that company. The link may be wrong, or the company may have been
        deleted.
      </p>
      <div className="mt-4">
        <Button asChild>
          <Link href="/companies">Back to companies</Link>
        </Button>
      </div>
    </div>
  )
}

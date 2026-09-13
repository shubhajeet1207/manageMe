import Link from "next/link"
import { Button } from "@/components/ui/button"

// Reached both when no such document exists and when it belongs to someone
// else. The copy must stay neutral: a message that hinted the record exists
// would turn this page into a probe for other users' data.
export default function DocumentNotFound() {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <h1 className="font-medium">Document not found</h1>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
        We could not find that document. The link may be wrong, or the document may have
        been deleted.
      </p>
      <div className="mt-4">
        <Button asChild>
          <Link href="/documents">Back to documents</Link>
        </Button>
      </div>
    </div>
  )
}

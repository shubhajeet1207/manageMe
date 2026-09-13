import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"

export default function NotFound() {
  return (
    <EmptyState
      title="Project not found"
      description="This project does not exist, or it is not yours."
    >
      <Button asChild variant="outline">
        <Link href="/projects">Back to projects</Link>
      </Button>
    </EmptyState>
  )
}

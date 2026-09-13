import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { listApplications } from "@/server/services/application-service"
import { listLinkTags } from "@/server/services/link-service"
import { listProjects } from "@/server/services/project-service"
import { listQuickDropItems } from "@/server/services/quick-drop-service"
import { QuickDropField } from "./quick-drop-field"
import { QuickDropList } from "./quick-drop-list"

export default async function QuickDropPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id
  const [items, projects, applications, tags] = await Promise.all([
    listQuickDropItems(userId),
    listProjects(userId),
    listApplications(userId),
    listLinkTags(userId),
  ])

  const options = {
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    applications: applications.map((application) => ({
      id: application.id,
      label: `${application.company.name} · ${application.roleTitle}`,
    })),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QuickDrop"
        description="Everything you captured without stopping to file it. Turn each one into a task, a link or a project — or let it go."
      />

      {/* The topbar's Drop button is two inches away, so this is the FIELD
          rather than a second trigger for the same sheet. */}
      <QuickDropField />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Anything you drop here from the topbar shows up in this list."
        />
      ) : (
        <QuickDropList items={items} options={options} tagSuggestions={tags} />
      )}
    </div>
  )
}

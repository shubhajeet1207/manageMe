import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { AppShell } from "@/components/layout/app-shell"
import { findById } from "@/server/repositories/user-repository"
import { countQuickDropItems } from "@/server/services/quick-drop-service"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const userId = session.user.id
  const [user, quickDropCount] = await Promise.all([
    userId ? findById(userId) : null,
    userId ? countQuickDropItems(userId) : 0,
  ])

  return (
    <AppShell
      user={{
        name: user?.name ?? null,
        email: user?.email ?? "",
        image: user?.image ?? null,
      }}
      quickDropCount={quickDropCount}
    >
      {children}
    </AppShell>
  )
}

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { AppShell } from "@/components/layout/app-shell"
import { findById } from "@/server/repositories/user-repository"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user.id ? await findById(session.user.id) : null

  return (
    <AppShell
      user={{
        name: user?.name ?? null,
        email: user?.email ?? "",
        image: user?.image ?? null,
      }}
    >
      {children}
    </AppShell>
  )
}

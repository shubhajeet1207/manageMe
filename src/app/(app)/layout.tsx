import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <AppShell
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        image: session.user.image ?? null,
      }}
    >
      {children}
    </AppShell>
  )
}

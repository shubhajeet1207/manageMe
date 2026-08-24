import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

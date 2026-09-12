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
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center justify-center gap-2">
          <span className="bg-stage-applied size-2 rounded-[2px]" aria-hidden />
          <span className="text-[15px] font-semibold tracking-tight">ManageMe</span>
        </div>
        {children}
      </div>
    </div>
  )
}

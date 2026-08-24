import { auth } from "@/lib/auth/auth"

export default async function DashboardPage() {
  const session = await auth()
  const name = session?.user?.name ?? session?.user?.email ?? "there"

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {name}</h1>
      <p className="text-muted-foreground mt-2">
        Your applications, resumes, and tasks will show up here as you add them.
      </p>
    </div>
  )
}

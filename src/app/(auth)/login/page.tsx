import Link from "next/link"
import { LoginForm } from "./login-form"

export default function LoginPage() {
  return (
    <div className="border-card-border bg-card shadow-raised rounded-xl border p-6">
      <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Pick the pipeline back up where you left it.
      </p>
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="border-border text-muted-foreground mt-6 border-t pt-5 text-sm">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}

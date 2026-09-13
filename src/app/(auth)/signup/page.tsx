import Link from "next/link"
import { SignupForm } from "./signup-form"

export default function SignupPage() {
  return (
    <div className="border-card-border bg-card shadow-raised rounded-xl border p-6">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        A tracker for the roles you are chasing, and the companies behind them.
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
      <p className="border-border text-muted-foreground mt-6 border-t pt-5 text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}

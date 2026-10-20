import Link from "next/link"
import { RetroWindow } from "@/components/retro-window"
import { SignupForm } from "./signup-form"

export default function SignupPage() {
  return (
    <RetroWindow title="Create your account" titleAs="h1" tone="lavender" bodyClassName="p-6">
      <p className="text-muted-foreground text-sm">
        A tracker for the roles you are chasing, and the companies behind them.
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
      <p className="border-card-border text-muted-foreground mt-6 border-t-2 border-dashed pt-5 text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary font-semibold underline underline-offset-2 hover:no-underline"
        >
          Log in
        </Link>
      </p>
    </RetroWindow>
  )
}

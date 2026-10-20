import Link from "next/link"
import { RetroWindow } from "@/components/retro-window"
import { LoginForm } from "./login-form"

export default function LoginPage() {
  return (
    <RetroWindow title="Log in" titleAs="h1" tone="coral" bodyClassName="p-6">
      <p className="text-muted-foreground text-sm">Pick the pipeline back up where you left it.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="border-card-border text-muted-foreground mt-6 border-t-2 border-dashed pt-5 text-sm">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-primary font-semibold underline underline-offset-2 hover:no-underline"
        >
          Sign up
        </Link>
      </p>
    </RetroWindow>
  )
}

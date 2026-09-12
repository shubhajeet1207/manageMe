import { auth } from "@/lib/auth/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { findById } from "@/server/repositories/user-repository"
import { ProfileForm } from "./profile-form"
import { PasswordForm } from "./password-form"
import { AppearanceForm } from "./appearance-form"

export default async function SettingsPage() {
  const session = await auth()
  const user = session?.user?.id ? await findById(session.user.id) : null

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Settings" description="Your profile, sign-in and theme." />

      <Card className="ring-border">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultName={user?.name ?? ""} />
        </CardContent>
      </Card>

      <Card className="ring-border">
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card className="ring-border">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceForm />
        </CardContent>
      </Card>
    </div>
  )
}

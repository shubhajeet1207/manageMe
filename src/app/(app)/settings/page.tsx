import { auth } from "@/lib/auth/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { findById } from "@/server/repositories/user-repository"
import { ProfileForm } from "./profile-form"
import { PasswordForm } from "./password-form"
import { AppearanceForm } from "./appearance-form"

export default async function SettingsPage() {
  const session = await auth()
  const user = session?.user?.id ? await findById(session.user.id) : null

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultName={user?.name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
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

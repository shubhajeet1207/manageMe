import { signOut } from "@/lib/auth/auth"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/login" })
      }}
      className="w-full"
    >
      <DropdownMenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
        Sign out
      </DropdownMenuItem>
    </form>
  )
}

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { signOutAction } from "./sign-out-action"

export function SignOutButton() {
  return (
    <form action={signOutAction} className="w-full">
      <DropdownMenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
        Sign out
      </DropdownMenuItem>
    </form>
  )
}

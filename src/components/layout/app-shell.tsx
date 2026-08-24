import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { SidebarNav } from "./sidebar-nav"
import { Topbar } from "./topbar"

export function AppShell({
  user,
  children,
}: {
  user: { name: string | null; email: string; image: string | null }
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 font-semibold">ManageMe</SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

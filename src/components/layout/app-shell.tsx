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
  quickDropCount,
  children,
}: {
  user: { name: string | null; email: string; image: string | null }
  // One named prop rather than a generic `badges` map: that is speculative
  // generality for one badge.
  quickDropCount: number
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar className="border-sidebar-border">
        <SidebarHeader className="h-14 flex-row items-center gap-2 px-4">
          <span className="bg-stage-applied size-2 rounded-[2px]" aria-hidden />
          <span className="text-[15px] font-semibold tracking-tight">ManageMe</span>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarNav quickDropCount={quickDropCount} />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <Topbar user={user} />
        <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

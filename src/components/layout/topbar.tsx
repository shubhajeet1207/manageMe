"use client"

import { usePathname } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { WindowControls } from "@/components/retro-window"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { siteNav } from "@/config/site"
import { QuickDropCapture } from "./quick-drop-capture"
import { UserMenu } from "./user-menu"

export function Topbar({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const pathname = usePathname()
  const current = siteNav.find((item) => pathname.startsWith(item.href))

  return (
    // A window title bar across the workspace, as in SpyMonk's topbar.
    <header className="border-card-border bg-surface sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b-2 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <WindowControls className="hidden sm:flex" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="eyebrow text-muted-foreground">
                {current?.title ?? "ManageMe"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        <QuickDropCapture />
        <UserMenu user={user} />
      </div>
    </header>
  )
}

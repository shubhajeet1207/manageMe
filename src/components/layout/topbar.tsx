"use client"

import { usePathname } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { siteNav } from "@/config/site"
import { UserMenu } from "./user-menu"

export function Topbar({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const pathname = usePathname()
  const current = siteNav.find((item) => pathname.startsWith(item.href))

  return (
    <header className="border-border bg-background/85 sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground text-[13px] font-medium">
                {current?.title ?? "ManageMe"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <UserMenu user={user} />
    </header>
  )
}

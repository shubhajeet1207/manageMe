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
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{current?.title ?? "ManageMe"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <UserMenu user={user} />
    </header>
  )
}

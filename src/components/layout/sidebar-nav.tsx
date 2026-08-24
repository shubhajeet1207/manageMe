"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { siteNav } from "@/config/site"

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <SidebarMenu>
      {siteNav.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            render={<Link href={item.href} />}
            isActive={pathname.startsWith(item.href)}
          >
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

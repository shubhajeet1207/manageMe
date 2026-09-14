"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { siteNav, type NavItem } from "@/config/site"

/**
 * Ungrouped items first, then each group in first-appearance order. The nav is
 * still read as data — one more field, not a new structure — and the sections
 * are deliberately NOT collapsible: ten links do not need accordion state, and
 * accordion state needs persistence to not be irritating.
 */
function groupNav(items: NavItem[]): { label: string | null; items: NavItem[] }[] {
  const sections: { label: string | null; items: NavItem[] }[] = []

  for (const item of items) {
    const label = item.group ?? null
    const existing = sections.find((section) => section.label === label)
    if (existing) existing.items.push(item)
    else sections.push({ label, items: [item] })
  }

  return sections
}

export function SidebarNav({ quickDropCount = 0 }: { quickDropCount?: number }) {
  const pathname = usePathname()
  const sections = groupNav(siteNav)

  return (
    // The navigation landmark has to be minted here. SidebarContent is a plain
    // <div> and it is shadcn-generated, so wrapping the nav content is the only
    // way to get the landmark without editing a vendored file. Without it the
    // sidebar is ten anonymous links: nothing in the landmarks rotor, and
    // nothing for "skip to navigation" to find. The label distinguishes it from
    // the topbar's breadcrumb <nav>.
    //
    // flex-col reproduces what these groups had as SidebarContent's own flex
    // children (a gap-0 column), so interposing this element changes the
    // rendered layout by nothing.
    <nav aria-label="Main" className="flex flex-col">
      {sections.map((section, index) => (
        <SidebarGroup key={section.label ?? `ungrouped-${index}`} className="p-0">
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                    className="data-active:bg-selected data-active:text-selected-foreground"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {/* An inbox you cannot see the size of is a folder. Omitted
                      at zero, because an empty inbox is success. */}
                  {item.href === "/quickdrop" && quickDropCount > 0 ? (
                    <SidebarMenuBadge className="tabular-nums">
                      {quickDropCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  )
}

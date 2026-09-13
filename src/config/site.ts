import { Briefcase, Building2, FileText, LayoutDashboard, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const siteNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Applications", href: "/applications", icon: Briefcase },
  { title: "Resumes", href: "/resumes", icon: FileText },
  { title: "Companies", href: "/companies", icon: Building2 },
  { title: "Settings", href: "/settings", icon: Settings },
]

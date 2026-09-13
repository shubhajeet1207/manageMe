import {
  Briefcase,
  Building2,
  CircleCheck,
  FileText,
  Files,
  FolderKanban,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Link2,
  Settings,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  // Optional section heading. Ungrouped items render first, then each group
  // in first-appearance order. One more field, not a new structure — the
  // array stays flat so topbar's `find` keeps working unchanged.
  group?: string
}

export const siteNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Applications", href: "/applications", icon: Briefcase, group: "Career" },
  { title: "Resumes", href: "/resumes", icon: FileText, group: "Career" },
  // `Files` rather than `Vault` or `FolderLock`: a padlock claims a
  // cryptographic property the document vault does not have (Phase 4 §8.10).
  { title: "Documents", href: "/documents", icon: Files, group: "Career" },
  { title: "Companies", href: "/companies", icon: Building2, group: "Career" },
  { title: "Tasks", href: "/tasks", icon: CircleCheck, group: "Productivity" },
  { title: "Projects", href: "/projects", icon: FolderKanban, group: "Productivity" },
  { title: "QuickDrop", href: "/quickdrop", icon: Inbox, group: "Productivity" },
  { title: "Links", href: "/links", icon: Link2, group: "Productivity" },
  { title: "Credentials", href: "/credentials", icon: KeyRound, group: "Productivity" },
  { title: "Settings", href: "/settings", icon: Settings },
]

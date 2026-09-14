import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { SidebarNav } from "./sidebar-nav"
import { Topbar } from "./topbar"

// SidebarInset already renders the <main>; it just had nothing to aim at.
const MAIN_CONTENT_ID = "main-content"

// Deliberately not `sr-only focus:not-sr-only`: sr-only pins the link with
// position:absolute and not-sr-only resets it to static, and the two land in
// the same Tailwind property bucket, so whether the focused link stays out of
// flow or shoves the sidebar down a row comes down to utility sort order.
// Staying `fixed` the whole time and moving only `top` has no such ambiguity —
// and it is a real offset rather than a clip, so the link is never hidden from
// the a11y tree, which is the one thing a bypass link cannot afford to be.
// The ring keys off :focus rather than the :focus-visible this codebase uses
// elsewhere, so that it fires on exactly the same condition as the reveal. A
// state where the link has slid into view without an indicator would be an SC
// 2.4.7 failure on the one control that exists only for keyboard users.
const SKIP_LINK =
  "border-border bg-surface text-foreground shadow-overlay focus:ring-ring fixed -top-20 left-3 z-50 rounded-md border px-3 py-2 text-sm font-medium outline-none transition-[top] focus:top-3 focus:ring-2"

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
      {/* WCAG 2.4.1 (Level A). Without a bypass the shell costs a keyboard user
          ten sidebar links, the sidebar toggle, Quick Drop and the user menu
          before the page itself — on every navigation, because the sidebar and
          topbar are repeated on every route. First focusable node in the
          document on purpose: a skip link reached after anything else has
          already failed at its job. */}
      <a href={`#${MAIN_CONTENT_ID}`} className={SKIP_LINK}>
        Skip to main content
      </a>
      <Sidebar className="border-sidebar-border">
        <SidebarHeader className="h-14 flex-row items-center gap-2 px-4">
          <span className="bg-stage-applied size-2 rounded-[2px]" aria-hidden />
          <span className="text-[15px] font-semibold tracking-tight">ManageMe</span>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarNav quickDropCount={quickDropCount} />
        </SidebarContent>
      </Sidebar>
      <SidebarInset
        id={MAIN_CONTENT_ID}
        // The hash has to move focus, not merely scroll. Browsers only adopt a
        // fragment target as the sequential-focus starting point reliably when
        // it can actually hold focus; without tabIndex the next Tab press after
        // the skip walks straight back into the sidebar and the link is
        // decorative. -1 keeps <main> out of the tab sequence itself.
        tabIndex={-1}
        className="min-w-0"
      >
        <Topbar user={user} />
        <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

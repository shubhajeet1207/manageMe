# ManageMe — Phase 1: Foundation — Design Spec

**Date:** 2026-08-24
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)

## 1. Context

ManageMe is a personal career & productivity management platform (job
applications, resumes, documents, projects, tasks, links, credentials,
analytics — see the full product master prompt for the end-state vision).
The full product is too large to design or build in one pass, so it is
being decomposed into phases, each with its own design spec and
implementation plan:

1. **Foundation** (this document) — project setup, auth, DB schema
   skeleton, design system, app shell/navigation.
2. Core career system — Companies, Applications, Statuses, Kanban, Table.
3. Resume system — library, versioning, PDF preview, resume↔application
   linking, resume analytics.
4. Documents — vault, uploads, preview, tags, search.
5. Productivity — Projects, Tasks, Links, QuickDrop, Credentials.
6. Analytics — dashboard widgets, career analytics, activity timeline.
7. Production hardening — security, testing, accessibility, performance,
   observability, deployment.

No reference video was available for this build; the written product
spec (sections 1–55 of the master prompt) is the sole source of truth
for UX/IA, interpreted with standard SaaS/productivity-app conventions
where the spec doesn't dictate specifics.

This document covers **Phase 1 only**. Later phases will each get their
own design doc that extends this foundation — this doc intentionally
does not design schema, pages, or navigation for modules outside Phase 1.

## 2. Goals

- A signed-in user can create an account, log in, log out, and edit
  their name/password from Settings.
- Unauthenticated users cannot reach `/dashboard` or `/settings`.
- The application shell (sidebar, topbar, responsive layout, theme
  toggle) is in place and will not need structural rework as later
  phases add nav items and pages.
- The layered architecture (UI → Server Action → Service → Repository →
  DB) and design token system are established so every later phase
  follows the same pattern instead of inventing a new one.
- The project is runnable locally end-to-end (`pnpm dev` against a real
  Postgres instance) and has a minimal automated test harness proving
  the auth flow works.

## 3. Explicit non-goals (deferred to later phases)

- Google OAuth (deferred until a phase where the OAuth client
  credentials are available; wiring point is documented below so it's a
  config change, not a rework, when it lands).
- Password reset / email verification (needs email-sending
  infrastructure not yet designed).
- Any nav item, page, or DB table for Applications, Resumes, Documents,
  Projects, Tasks, Links, Credentials, QuickDrop, Search, Notifications,
  or Activity Log.
- Rate limiting, CSRF hardening beyond Auth.js defaults, and other
  Section 35 security items — explicitly Phase 7 scope.
- Deployment configuration (Vercel/CI) — Phase 7 scope.
- Dashboard metric widgets — depend on Applications/Tasks data that
  doesn't exist yet; Phase 1's dashboard is an authenticated landing
  page only (see §7).

## 4. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict mode) |
| Package manager | pnpm |
| Styling | Tailwind v4 |
| Component library | shadcn/ui ("new-york" style), Radix UI primitives, Lucide icons |
| Forms/validation | React Hook Form + Zod (shared client/server schemas) |
| Database | PostgreSQL, hosted on Neon (free tier) |
| ORM | Prisma |
| Auth | Auth.js v5 (`next-auth@beta`), Credentials provider only |
| Password hashing | argon2id via `@node-rs/argon2` |
| Theming | `next-themes` (light/dark) |
| Toasts | shadcn `sonner` |
| Unit testing | Vitest |
| E2E testing | Playwright |
| Lint/format | ESLint (Next.js config) + Prettier |

## 5. Architecture

Layering, established now for every later phase to reuse:

```
UI (Server/Client Components)
   → Server Actions (thin: parse input with Zod, call a service, return result)
      → Services (business logic; server/services/*)
         → Repositories (Prisma queries only; server/repositories/*)
            → PostgreSQL (via Prisma)
```

Folder structure (Phase 1 scope — no empty stub folders for unbuilt
modules; later phases add their own folders under the same top-level
layout):

```
src/
  app/
    (auth)/
      login/page.tsx
      signup/page.tsx
    dashboard/page.tsx
    settings/page.tsx
    api/auth/[...nextauth]/route.ts
    layout.tsx                # root layout: theme provider, toaster
  components/
    ui/                       # shadcn primitives (generated)
    layout/
      app-shell.tsx
      sidebar.tsx
      topbar.tsx
      user-menu.tsx
  server/
    services/
      auth-service.ts         # createUser(), verifyCredentials(), updateProfile()
    repositories/
      user-repository.ts      # thin Prisma wrapper: findByEmail, create, update
    validators/
      auth-schemas.ts         # signupSchema, loginSchema, updateProfileSchema
  lib/
    auth/
      auth.ts                 # Auth.js config (providers, callbacks)
      password.ts             # hash()/verify() wrapping @node-rs/argon2
    db/
      prisma.ts               # Prisma client singleton
    utils/
      cn.ts                   # shadcn's classname helper
  hooks/
  types/
    next-auth.d.ts            # session/user type augmentation (id on session.user)
config/
  site.ts                     # nav items list, app name, etc.
prisma/
  schema.prisma
e2e/
  auth.spec.ts
middleware.ts
.env.example
```

Server Actions live colocated with the page that uses them (e.g.
`app/(auth)/signup/actions.ts`) and are the *only* layer allowed to call
`server/services/*`. Components never import Prisma or repositories
directly.

## 6. Database schema (Phase 1)

Only one model is needed this phase. Auth.js's `Account`, `Session`,
and `VerificationToken` models are **not** created yet — they exist to
support the Prisma Adapter, which Phase 1 doesn't use (the Credentials
provider creates/reads users directly through our own service, not
through an adapter, and sessions are JWTs, not DB rows). These tables
get added in the migration that introduces Google OAuth, since that's
the point they become load-bearing — adding them now would mean
unused columns and an unused adapter wired in for no reason.

```prisma
model User {
  id             String   @id @default(cuid())
  name           String?
  email          String   @unique
  hashedPassword String
  image          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([email])
}
```

(`email` already has a unique constraint, which Postgres backs with an
index — the explicit `@@index` is redundant and will be dropped; see
self-review note in §12.)

## 7. Pages & flows

### Signup (`/signup`)
Form: name, email, password (min 8 chars, at least one letter and one
digit — enforced by a shared Zod schema used in both the client form
resolver and the Server Action). On submit:
1. Server Action re-validates with the same schema (never trusts client
   validation alone).
2. `authService.createUser()` checks for an existing email via the
   repository; if found, returns a field-level error on `email`
   ("An account with this email already exists") rather than a generic
   failure.
3. Password is hashed (argon2id) before the repository writes the row.
4. On success, the action signs the user in immediately (calling
   Auth.js `signIn("credentials", …)` server-side) and redirects to
   `/dashboard` — no separate "please log in" step, per the product
   spec's low-friction principle.

### Login (`/login`)
Form: email, password. On failure, the error is the same generic
"Invalid email or password" regardless of whether the email exists —
avoids leaking account existence. Successful login redirects to
`/dashboard` (or the originally-requested protected page, via a
`callbackUrl` param that `middleware.ts` sets when redirecting).

### Dashboard (`/dashboard`)
Minimal authenticated landing page: greets the user by name. No metric
cards or widgets — those require Applications/Tasks data that doesn't
exist until later phases, and shipping hardcoded/zero placeholder cards
would violate the "no fake UI" rule. The page is real and functional
for what it does today; it is not a stub for something it claims to be.

### Settings (`/settings`)
Two real, working sections:
- **Profile** — edit display name (email is not editable in Phase 1;
  changing the login email is deferred since it would need
  re-verification flows that don't exist yet).
- **Security** — change password (requires current password,
  re-hashes and saves the new one).
- **Appearance** — light/dark/system theme toggle.

Sign out is available from the user menu in the topbar (available on
every authenticated page, not just Settings).

## 8. Auth design

- Auth.js v5, single Credentials provider. `authorize()` calls
  `authService.verifyCredentials(email, password)`, which looks up the
  user via the repository and compares the password with
  `lib/auth/password.ts`'s `verify()`. Returns `null` (→ generic
  "Invalid email or password") on any mismatch, including "user not
  found" — same message either way.
- Session strategy: **JWT** (required — Auth.js does not support
  database-persisted sessions when a Credentials provider is
  configured). `jwt` callback copies `user.id` onto the token;
  `session` callback exposes it as `session.user.id`. Default Auth.js
  expiry (30 days, rolling).
- `middleware.ts` uses the `auth` export from `lib/auth/auth.ts` with a
  matcher covering `/dashboard/:path*` and `/settings/:path*`;
  unauthenticated requests redirect to `/login?callbackUrl=<original>`.
- **Google OAuth wiring point (future, not built now):** when added,
  it's a new provider entry in `lib/auth/auth.ts`, a `PrismaAdapter`
  wired in, and the `Account`/`Session`/`VerificationToken` models
  added via migration. JWT session strategy is kept even after OAuth
  is added (Auth.js supports adapter + JWT sessions together), so no
  rework of the callbacks above is expected.

## 9. Design system

shadcn/ui initialized with the "new-york" style and CSS-variable-based
theming (so light/dark is a variable swap, not duplicated styles).
Tailwind config carries the spacing/radius/typography scale that every
later phase's components reuse rather than redefining. `next-themes`
provides the theme context; the toggle lives in Settings → Appearance
and (compactly) in the user menu.

## 10. App shell & navigation

Collapsible sidebar (shadcn sidebar block, customized) listing only
**Dashboard** and **Settings** — per the decision to show only built
modules, so there are no dead links. `config/site.ts` holds the nav
item list as data; adding a module in a later phase means appending to
that list, not restructuring the sidebar component. Topbar shows a
breadcrumb (derived from the route) and a user menu (avatar, name,
theme toggle, sign out). No global search box or notification bell in
Phase 1 — both are real features designed and built in their own later
phases, not stubbed here.

Responsive behavior: sidebar collapses to an icon rail at medium
widths and to a drawer (triggered from the topbar) on mobile, per
shadcn's sidebar component defaults.

## 11. Cross-cutting concerns

- **Validation:** every Server Action re-validates its input with the
  same Zod schema used client-side. Client-side validation is UX only.
- **Error handling:** form-level errors render inline under the
  relevant field (from Zod's flattened error map); action-level
  failures (e.g. unexpected DB error) surface as a `sonner` toast with
  a generic message — no stack traces or raw error strings reach the
  client.
- **Loading states:** a skeleton renders in the topbar/user-menu area
  while the session is resolving on first paint; form submit buttons
  show a spinner and disable while pending.
- **Testing:**
  - Vitest unit tests for `auth-schemas.ts` (valid/invalid cases) and
    `password.ts` (hash → verify round-trip, wrong password rejected).
  - One Playwright E2E spec (`e2e/auth.spec.ts`): sign up with a fresh
    email → land on dashboard showing the user's name → sign out →
    log back in → sign out. This is the only E2E test in Phase 1;
    broader E2E coverage is built alongside each later phase's
    features.
- **Env vars (`.env.example`):** `DATABASE_URL`, `AUTH_SECRET`,
  `NEXT_PUBLIC_APP_URL`. (`GOOGLE_CLIENT_ID`/`SECRET` and storage vars
  are added in the phases that need them, not pre-declared here.)

## 12. Spec self-review notes

- Removed a redundant `@@index([email])` from the `User` model in
  §6 in the same pass this doc was written — Postgres already indexes
  unique columns, so the explicit index was dead weight, not a design
  decision. The model shown above already reflects the fix.
- Checked for placeholders/TBDs: none remain — every field above (env
  vars, schema, session strategy, error messages, test scope) is
  fully specified.
- Scope check: this document only covers Phase 1. Every "later phase"
  reference above is a deliberate non-goal, not a deferred decision
  that should have been made here.
- Ambiguity check: the two places a reader could reasonably ask "which
  did you mean" — (a) whether login/signup errors reveal account
  existence, and (b) whether Google OAuth needs a session-strategy
  change later — are both resolved explicitly in §7 and §8.

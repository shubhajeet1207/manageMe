# ManageMe — Phase 2: Core Career System — Design Spec

**Date:** 2026-09-12
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)

## 1. Context

Phase 1 (Foundation) shipped the project skeleton: Next.js app, Postgres
via Prisma, Auth.js credentials auth, the design system, and the app
shell. See `docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`.

This phase builds the **core career system** — the reason the product
exists. A signed-in user can record the companies they're applying to,
track each application through a hiring pipeline, and see the whole
pipeline as either a drag-and-drop board or a sortable table.

The master product prompt referenced by the Phase 1 spec was not
available when this document was written. The requirements below were
derived directly with the product owner in a brainstorming session on
2026-09-12; that session is the source of truth for this phase, and
every decision in it is recorded here rather than left implicit.

This document covers **Phase 2 only**. Phase 3 (Resumes) is blocked on
an unmade file-storage decision and is not designed here.

## 2. Goals

- A signed-in user can create, edit, and delete companies, and see every
  application they've made to a given company in one place.
- A signed-in user can create, edit, and delete applications, each
  belonging to a company and carrying a status, role title, and the
  details needed to compare opportunities.
- The applications page offers two views of the same data: a **Board**
  (Kanban) where dragging a card between columns changes its status, and
  a **Table** with sorting and status filtering.
- A user can only ever read or write their own companies and
  applications. This is enforced at the repository layer, not left to
  callers to remember.
- The data model supports Phase 6's analytics (conversion rates between
  pipeline stages, applications per company, activity over time) without
  needing a reshape.

## 3. Explicit non-goals (deferred)

- **Resumes and resume↔application linking** — Phase 3. No `resumeId` on
  `Application` this phase; it's added by the migration that introduces
  the `Resume` model.
- **Interview rounds, recruiter contacts, follow-up reminders** — these
  are their own subsystem. Considered during brainstorming and
  deliberately cut rather than bolted onto `Application`.
- **Manual card ordering within a board column** — see §8.
- **User-customizable statuses** — the pipeline is a fixed enum (§6).
- **Bulk actions, CSV import/export, archiving** — no evidence they're
  needed yet; they'd be additive, not structural.
- **Dashboard metric widgets** — Phase 6. The dashboard keeps its Phase 1
  greeting; it does not gain application counts here.
- **Global search across applications** — Search is its own later phase.
  The Table view's status filter is not a search feature.

## 4. Tech additions

Everything is inherited from Phase 1. New dependencies:

| Concern | Choice |
|---|---|
| Drag and drop | `@dnd-kit/core` (pointer + keyboard sensors) |

New shadcn/ui primitives to generate: `table`, `select`, `textarea`,
`badge`, `alert-dialog`, `command`, `popover`, `calendar`, `tabs`.

`@dnd-kit/sortable` is **not** installed — it exists for ordering items
within a list, which §8 rules out. Cards move between columns only.

## 5. Architecture

Unchanged from Phase 1:

```
UI → Server Action → Service → Repository → Prisma → PostgreSQL
```

### 5.1 The ownership rule (new, load-bearing)

Phase 1 had exactly one model (`User`), so no multi-tenancy pattern was
needed. Phase 2 introduces the first user-owned data, and the convention
set here is inherited by every later phase:

> **Every repository function that touches a user-owned row takes
> `userId` as its first parameter and includes it in the `where` clause.
> There is no repository function that can read or write a row without
> being told whose row it is.**

Concretely, reads use `findFirst({ where: { id, userId } })` rather than
`findUnique({ where: { id } })`, and writes use `updateMany`/`deleteMany`
scoped by `{ id, userId }`, checking the returned `count` to distinguish
"not found" from "not yours" — both of which surface to the user
identically as not-found, so the API never reveals that another user's
record exists.

This is deliberately rigid. The alternative — services remembering to
check ownership — fails silently and leaks data the first time someone
adds a repository call without thinking about it.

### 5.2 Folder structure (additions only)

```
src/
  app/(app)/
    applications/
      page.tsx                  # Board/Table toggle, reads searchParams
      loading.tsx
      actions.ts
      application-board.tsx     # dnd-kit board (client)
      application-table.tsx     # sortable table (client)
      application-card.tsx
      application-sheet.tsx     # create/edit form in a Sheet (client)
      application-form.tsx
      delete-application-dialog.tsx
      view-toggle.tsx
    companies/
      page.tsx
      loading.tsx
      actions.ts
      company-table.tsx
      company-sheet.tsx
      company-form.tsx
      delete-company-dialog.tsx
      [id]/
        page.tsx                # company detail + its applications
        loading.tsx
        not-found.tsx
  components/
    company-combobox.tsx        # shared: command + popover autocomplete
    status-badge.tsx
  server/
    repositories/
      company-repository.ts
      company-repository.test.ts
      application-repository.ts
      application-repository.test.ts
    services/
      company-service.ts
      company-service.test.ts
      application-service.ts
      application-service.test.ts
    validators/
      company-schemas.ts
      company-schemas.test.ts
      application-schemas.ts
      application-schemas.test.ts
  types/
    action-result.ts            # shared ActionResult (see §11.5)
e2e/
  applications.spec.ts
```

## 6. Database schema

```prisma
enum ApplicationStatus {
  SAVED
  APPLIED
  SCREENING
  INTERVIEW
  OFFER
  ACCEPTED
  REJECTED
}

enum WorkMode {
  ONSITE
  HYBRID
  REMOTE
}

model Company {
  id        String   @id @default(cuid())
  userId    String
  name      String
  website   String?
  location  String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  applications Application[]

  @@unique([userId, name])
  @@index([userId])
}

model Application {
  id         String            @id @default(cuid())
  userId     String
  companyId  String
  roleTitle  String
  status     ApplicationStatus @default(SAVED)
  jobUrl     String?
  location   String?
  workMode   WorkMode?
  salaryMin  Int?
  salaryMax  Int?
  currency   String?
  source     String?
  appliedAt  DateTime?
  notes      String?
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([userId, status])
  @@index([userId, companyId])
}
```

`User` gains the two back-relations (`companies`, `applications`).

**Decisions embedded above, and why:**

- **`ACCEPTED` is a separate stage from `OFFER`.** Collapsing them would
  permanently destroy the offer→accept conversion rate that Phase 6
  wants. `WITHDRAWN` was considered and cut: it's one enum value to add
  later, and an eighth board column costs more than it returns today.
- **`onDelete: Restrict` on `Application.company`.** Deleting a company
  that still has applications is refused with a clear message rather
  than cascading. A cascade would silently destroy application history,
  which is the kind of loss noticed a month too late.
- **`onDelete: Cascade` from `User`.** If an account is ever deleted,
  its data goes with it. That direction is intentional.
- **`@@unique([userId, name])` on `Company`** prevents "Google" existing
  twice for one user, which would split that company's history across
  two rows and quietly corrupt Phase 6's per-company analytics. The
  constraint is per-user, so two different users may both have a Google.
- **`salaryMin`/`salaryMax` are `Int`, with a separate `currency`
  string.** Storing a formatted string would make ranges unsortable and
  uncomparable. `Int` (whole currency units) avoids float rounding.
- **No `position` field.** See §8.

## 7. Pages & flows

### Applications (`/applications`)

The single page for both views. The active view is held in the URL
(`?view=board` / `?view=table`, defaulting to board) so a view survives
a refresh and can be linked to. A Server Component loads the user's
applications (with their company) and passes them to whichever view is
active.

**Create/edit** happens in a `Sheet` rather than a dedicated page —
adding an application is frequent and small, and a full navigation for
it is friction. The form carries every §6 field. Company is chosen
through a combobox that autocompletes over the user's existing
companies and offers "Create <typed name>" when there's no match, so
adding an application to a brand-new company doesn't require visiting
`/companies` first.

**Delete** requires confirmation via `AlertDialog`. Deletion is
permanent; there is no archive state this phase.

**Empty state:** when the user has no applications, the page shows a
real empty state explaining what the page is for with a button to add
the first application — not an empty board with seven empty columns.

### Board view

Seven columns in pipeline order, each showing its status name and a
count. Cards show company name, role title, and location when set.
Dragging a card to another column changes its status (§8).

The board scrolls horizontally on narrow viewports rather than
reflowing — seven columns cannot be made legible on a phone, and a
horizontally scrolling board is the honest presentation. The Table view
is the better mobile experience and both are always reachable.

### Table view

Columns: Company, Role, Status, Location, Applied date, Salary. Sortable
by company, role, status, and applied date; filterable by status.
Sorting and filtering state lives in the URL alongside `view`, for the
same reason.

### Companies (`/companies`)

A table of the user's companies: name, website, location, and
application count. Create/edit in a `Sheet`, delete behind an
`AlertDialog`. Attempting to delete a company that still has
applications surfaces the refusal as an inline message naming the count
("This company has 3 applications. Delete or reassign them first.") —
not a generic failure toast.

### Company detail (`/companies/[id]`)

The company's details plus every application at that company, using the
same table component as the Table view. This is the payoff for making
Company a real entity: one page answering "what happened with this
company". A company id that doesn't exist *or isn't yours* renders the
same `not-found.tsx` — the two cases are indistinguishable to the
client by design.

## 8. Board interaction

`@dnd-kit/core` with `PointerSensor` and `KeyboardSensor`, so the board
is operable without a mouse. Columns are droppables; cards are
draggables.

On drop, the card moves immediately in local state and a Server Action
persists the change. If the action fails, the card returns to its
original column and a `sonner` toast reports it — the UI never claims a
change that didn't persist.

**No manual ordering within a column.** Cards sort by `updatedAt`
descending, so a card just moved sits at the top of its new column.
Persisting hand-ordering would require a fractional index maintained on
every drag, plus rebalancing; the brainstorming session judged this not
worth its cost. Dropping a card within its current column is a no-op,
not an error.

A card being dragged is also a link target; the drag sensor uses an
activation constraint (a small distance threshold) so a click still
opens the edit sheet and doesn't register as a drag.

## 9. Navigation

`config/site.ts` gains two entries, between Dashboard and Settings:

```ts
{ title: "Applications", href: "/applications", icon: Briefcase },
{ title: "Companies",    href: "/companies",    icon: Building2 },
```

That is the whole navigation change — the sidebar component reads this
list as data, exactly as Phase 1 designed it. Still no nav entries for
unbuilt modules.

## 10. Route protection

`middleware.ts`'s matcher must be extended to cover `/applications/:path*`
and `/companies/:path*`. This is easy to forget and would silently
expose both pages to unauthenticated users, so it is called out here as
a required step rather than left implicit — and §11.4 requires an E2E
test proving it.

Server Actions do not rely on middleware for authorization: every action
independently calls `auth()` and returns `{ success: false, formError:
"Unauthorized." }` without a session, matching Phase 1's actions.
Middleware protects navigation; actions protect data.

## 11. Cross-cutting concerns

### 11.1 Validation
Every Server Action re-validates with the same Zod schema the client
form uses. `applicationSchema` enforces: `roleTitle` non-empty (max 200),
`companyId` present, `status` a valid enum member, `jobUrl` a valid URL
when present, `salaryMax >= salaryMin` when both are given (a
cross-field refinement), and `appliedAt` not in the future.

### 11.2 Error handling
Domain errors are typed classes thrown by services and mapped to field
errors by actions, exactly as `EmailAlreadyExistsError` is in Phase 1:
`CompanyNameTakenError` → field error on `name`;
`CompanyHasApplicationsError` (carrying the count) → the §7 message;
`NotFoundError` → generic not-found. Unexpected errors become a generic
toast; no raw error text reaches the client.

### 11.3 Loading states
`loading.tsx` skeletons for each route. Sheet submit buttons disable and
show pending text while their action runs, matching the Phase 1 forms.

### 11.4 Testing
- **Unit:** Vitest for `company-schemas` and `application-schemas`,
  including the salary-range refinement and the future-date rejection.
- **Integration (real dev database, cleaning up their own rows):**
  repositories and services for both models. These **must** include
  ownership tests: seed two users, then assert that user B cannot read,
  update, or delete user A's company or application, and that the
  attempt is indistinguishable from not-found.
- **E2E (`e2e/applications.spec.ts`):** unauthenticated `/applications`
  and `/companies` redirect to login; then create a company → create an
  application against it → drag the card from Applied to Interview →
  switch to Table view and confirm the new status → delete the
  application → confirm the company refuses deletion while an
  application exists.
- Playwright's raised timeouts from Phase 1 apply; the remote database
  makes every action multi-second.

### 11.5 Shared `ActionResult`
Phase 1 declares the same result union twice — `SignupResult` in
`app/(auth)/signup/actions.ts` and `ActionResult` in
`app/(app)/settings/actions.ts`. Phase 2 adds four more action modules,
so this phase extracts it once to `src/types/action-result.ts` and
updates the two Phase 1 modules to import it. This is a targeted
cleanup of code this phase builds directly on, not unrelated
refactoring.

## 12. Spec self-review notes

- **Placeholder scan:** none remain. Every enum member, index, cascade
  rule, route, and test case above is specified concretely.
- **Internal consistency:** §6's `onDelete: Restrict` matches §7's
  refusal message and §11.2's `CompanyHasApplicationsError`; §8's "no
  ordering" matches §6's absence of a `position` field and §4's omission
  of `@dnd-kit/sortable`. Checked and consistent.
- **Ambiguity check:** the two places a reader could reasonably ask
  "which did you mean" — (a) whether a non-owned record 404s or 403s,
  and (b) whether deleting a company deletes its applications — are
  resolved explicitly in §5.1/§7 and §6 respectively.
- **Scope check:** this is one implementation plan's worth of work. The
  board and table share a data source and a page, so splitting them
  across phases would mean building the page twice.
- **Known deferral:** `Application` gains `resumeId` in Phase 3. That is
  an additive nullable column, so it needs no reshape of anything above.

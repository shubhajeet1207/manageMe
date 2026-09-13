# ManageMe — Phase 5: Productivity — Design Spec

**Date:** 2026-09-13
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)

## 1. Context

Phase 1 (Foundation) shipped the skeleton — Next.js, Postgres via Prisma,
Auth.js credentials auth, the design system, the app shell. Phase 2 (Core
Career System) shipped Companies and Applications and, more importantly
for every later phase, the **ownership rule**. Phase 3 (Resume System)
shipped resume slots, versions, the storage driver, and the first
security-critical subsystem. See
`docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`,
`docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`, and
`docs/superpowers/specs/2026-09-13-phase3-resume-system-design.md`.

Phase 1 §1 describes this phase in one line: *"Productivity — Projects,
Tasks, Links, QuickDrop, Credentials."* That line is the entire brief.

**This phase does not store files.** Projects, Tasks, Links, QuickDrop
items and Credentials are all rows. The storage driver built in Phase 3
(`src/server/storage/`) is not touched, no new bytes are written to
disk, and nothing here waits on Phase 4's document vault. Phase 5 is
therefore **independent of Phase 4** and can ship before it, after it,
or alongside it.

It is, however, the phase that introduces **secrets belonging to other
systems**. A resume PDF is the user's own document; a job-portal
password is a credential to a third party, and losing it is not an
inconvenience the user can absorb by re-uploading a file. §9 is the
longest section in this document for that reason, and it is written to
be read on its own.

Two of the five names in Phase 1's line — **QuickDrop** and **Links** —
are defined nowhere in this repository. §4 states what they are taken to
mean and why, before anything is designed on top of them.

This document covers **Phase 5 only**.

## 2. Goals

- A signed-in user can create, edit and delete **Projects** — their own
  work ("Portfolio site", "Learn Rust"), not job applications — each
  with a status and its own task list.
- A signed-in user can create, edit, complete and delete **Tasks**, each
  with a status, an optional due date, and an optional owner: a project
  **or** a job application. "Send follow-up to Acme" is a first-class
  thing this app can hold (§7.3).
- A signed-in user can save **Links** — reference URLs with a title and
  tags — and filter them by tag.
- A signed-in user can capture a URL or a line of text into
  **QuickDrop** from any page in one interaction, and later triage each
  item into a task, a link or a project — or dismiss it.
- A signed-in user can store **Credentials** for third-party sites
  (job portals), encrypted at rest with AES-256-GCM under a dedicated
  key, revealed only by an explicitly re-authorised action, and never
  present in the HTML of a list or detail page.
- Every one of the above is readable and writable only by its owner,
  enforced at the repository layer, with the cross-entity guards the
  new relations require — and each guard proven by a test that goes
  through the public service function, not the guard.
- Nothing here blocks, or is blocked by, Phase 4.

## 3. Explicit non-goals (deferred)

Mandated by the brief, and each one held to:

- **No sharing.** Nothing in this phase is readable by a second person.
  There is no share link, no public URL, no export-to-anyone, no
  "send to". This is the load-bearing non-goal for §9: the credential
  threat model assumes exactly one reader.
- **No collaboration.** No assignees, no comments, no mentions, no
  multi-user projects. A task has an owner and that owner is the only
  user in the system who can see it.
- **No recurring tasks.** A recurrence rule needs an expansion strategy
  (materialise instances vs. compute on read), a "this one vs. all
  future" edit model, and a timezone story sharper than §7.5's. It is a
  subsystem, not a column.
- **No time tracking.** No timers, no logged hours, no estimates.
- **No browser extension.** QuickDrop's capture affordance is in the
  app's own topbar (§8.5). An extension is a second distributable, a
  second permission model, and a second review process.
- **No password generation and no breach checking.** Generation is a
  small function with a large obligation (getting the entropy source
  and the character-class handling right); breach checking means sending
  a hash prefix of the user's password to a third party, which is a
  network call this feature has no business making. §9.10 says plainly
  that a dedicated password manager does both, and better.

Deferred for reasons of scope rather than principle:

- **Subtasks, dependencies, manual ordering.** Tasks sort by due date
  (§8.3). Hand-ordering was rejected for the Phase 2 board for the same
  reason and there is no `position` column here either.
- **Priority.** A second ordering axis alongside due date. On a personal
  list it degenerates to "everything is high" within a month.
- **Reminders and notifications.** Needs a scheduler and a delivery
  channel, neither of which exists.
- **Calendar sync, and any import/export.** Including importing a
  password-manager CSV, which would mean parsing plaintext secrets out
  of a file upload — precisely the shape §9 exists to avoid.
- **Link previews, favicons, or title auto-fill.** Fetching a
  user-supplied URL server-side is a server-side request forgery
  primitive: it would let a client make the server request
  `http://169.254.169.254/…` or an internal host and infer the result
  from timing or error text. Declined outright rather than mitigated
  with an allowlist we would then have to maintain.
- **URL canonicalisation and duplicate detection** for Links. URL
  identity is not a solved problem — a trailing slash, a `utm_` tail and
  a `#fragment` all mean the same page — so a unique constraint would
  hard-fail on near-duplicates while missing real ones.
- **TOTP / 2FA seeds in Credentials.** Storing the second factor beside
  the first collapses two factors into one, in an app whose own residual
  risk is stated in §9.10. Out of scope, and it should stay out.
- **Autofill, clipboard managers, or any browser integration** for
  credentials.
- **Full-text search** across tasks, links and QuickDrop. Search is its
  own later phase; the per-page URL filters here are not search.
- **Dashboard widgets and analytics** over any of this — Phase 6.
- **File attachments** on tasks or projects — Phase 4's vault, and the
  reason this phase touches no bytes.
- **Linking `Project` to `ResumeProject`** ("promote this to my
  resume"). See §7.2.
- **Archiving and bulk actions**, matching Phase 2 §3.
- **Rate limiting**, including on the credential reveal action — Phase 7,
  as Phase 1 §3 scoped it. §9.7 records what that means here.

## 4. Two names with no definition in this repository

Phase 1 §1 names five modules. Three are self-describing. Two are not,
and the master product prompt that produced them **has never been
available to any spec in this repository** — Phase 2 §1 recorded the
same absence and derived its requirements with the product owner
instead. No such session preceded this document, so the two names below
are **inferred**, and this section is the record of the inference.

If the master prompt resurfaces and disagrees, this is the first section
to re-read.

### 4.1 QuickDrop — taken to mean a quick-capture inbox

**Interpretation.** A single-field inbox. The user pastes a URL or types
a line of text, presses one key, and it is saved — with no category, no
title, no project, no due date. Later, from `/quickdrop`, each item is
**triaged**: turned into a Task, a Link or a Project, or dismissed. The
value of the feature is entirely **capture speed**; the value of the
inbox is that it empties.

**Why this reading.** Four things point at it:

1. It is the only verb-shaped name in a list of nouns (Projects, Tasks,
   Links, Credentials). A name of the form *adverb + deposit verb* reads
   as an affordance — the act of putting something somewhere fast —
   rather than as a record type.
2. The failure mode a career tracker actually has is friction at the
   moment of capture. A job posting is seen at 23:40 on a phone; the
   cost of "open the app, choose a company, choose a status, fill six
   fields" is that it is not captured at all.
3. Triage is what makes the rest of the phase compose: a triaged URL is
   a **Link**, a triaged line of text is a **Task**, a triaged idea is a
   **Project**. Under this reading the five modules are one system, and
   QuickDrop is the front door. Under any other reading it is a fifth
   unrelated CRUD screen.
4. Every shipped product with a name of this shape — Drafts, an Inbox,
   a daily-note capture — means the same thing.

**Alternatives considered and rejected.**

- *A file drop zone.* Rejected: that is Phase 4's document vault, and
  this phase deliberately stores no bytes (§1). Two competing upload
  surfaces would be worse than either.
- *A UI affordance rather than an entity* — a drag target somewhere.
  Rejected: Phase 1 §3 lists "QuickDrop" alongside Applications,
  Resumes, Documents and Credentials as a thing with "no nav item, page,
  or DB table" yet, which is a list of entities.

**Cost of being wrong.** One table with one text column, one page, one
topbar button, and a conversion path that is a create plus a delete in
one transaction. Nothing else in this phase depends on it: Tasks, Links
and Projects are complete features without it. That is the honest risk
accounting — the inference is cheap to undo.

### 4.2 Links — taken to mean saved reference URLs

**Interpretation.** A bookmark list scoped to the user's career: a
salary guide, an interview-prep article, a recruiter's scheduling page,
a company's engineering blog. Each Link has a **required URL**, a
**required title**, an optional description and **tags**. It is browsed
and filtered by tag.

**Why this reading, and how it differs from QuickDrop.** A Link is
**triaged**; a QuickDrop item is **not**. The difference is state, not
content: the same pasted URL is a QuickDrop item at 23:40 and a Link
with a title and two tags on Sunday. That is why both names belong in
the same phase and why neither subsumes the other — and it is the
strongest evidence that both readings are right, because they compose
into one coherent flow rather than overlapping.

Note what a Link is *not*: it is not `Application.jobUrl` (that URL
belongs to an application and already has a home) and it is not a
`ResumeProject.url` (that one belongs to a resume line). Links are the
URLs that belong to **nothing else**.

**Cost of being wrong.** One table, one page. As above.

## 5. Tech additions

**No new npm dependencies.** Stated as a result, not an accident:

| Concern | Choice | Why not a dependency |
|---|---|---|
| Encryption | `node:crypto` `createCipheriv("aes-256-gcm", …)` | AES-GCM is in the platform. A crypto wrapper library is a supply-chain dependency in the one place where a supply-chain dependency is least acceptable. |
| Key material / nonces | `node:crypto` `randomBytes`, `createHash` | Built in, and the only correct source of a nonce. |
| Password verification for the reveal step-up | the existing `verifyPassword` in `src/lib/auth/password.ts` (argon2id) | Already used by the Credentials auth provider. Reusing it means the step-up check and the login check cannot drift. |
| Tag input | the chip interaction already in `resumes/[id]/skills-editor.tsx`, extracted to `src/components/tag-input.tsx` | `command` + `popover` is a combobox for a list we do not have; the chips pattern is already written and already in the design language. |
| Date input | native `<input type="date">` | A date picker is `calendar` + `popover` + a parsing story. §7.5 makes the value a plain calendar date, which is exactly what the native control emits. |

New shadcn/ui primitives to generate: **`checkbox`** (the task
completion control). That is the only one — `table`, `select`, `sheet`,
`alert-dialog`, `badge`, `card`, `input`, `textarea`, `label`,
`dropdown-menu` all exist.

New environment variables, all documented in `.env.example`:

```
# 32 random bytes, base64. Generate with: openssl rand -base64 32
# Encrypts stored credential passwords (AES-256-GCM). NOT AUTH_SECRET,
# and never derived from the database — see the Phase 5 spec §9.2.
CREDENTIALS_KEY=""

# Optional. The previous CREDENTIALS_KEY, kept decrypt-only during a
# rotation so existing records stay readable until they are re-encrypted.
CREDENTIALS_KEY_PREVIOUS=""
```

`src/lib/db/prisma.ts` gains a client-level `omit` for the three
credential secret columns (§9.6). That is the only change to it.

## 6. Architecture

Unchanged through four phases:

```
UI → Server Action → Service → Repository → Prisma → PostgreSQL
```

with one addition, placed exactly where Phase 3 placed storage:

```
Service → SecretBox (node:crypto) → ciphertext bytes → Repository
```

Encryption sits **beside** the repository, not beneath it. The service
holds plaintext for the duration of one call and hands the repository
three opaque byte arrays; the repository knows nothing about plaintext,
keys, or algorithms, and stays what it has always been — Prisma queries
and nothing else. Phase 3 §5 made the same call for bytes on disk, and
the reasoning is the same: a repository that could decrypt would be a
repository that could accidentally decrypt on a list query.

### 6.1 The ownership rule, as it applies here

Phase 2 §5.1, restated unchanged and not optional:

> **Every repository function that touches a user-owned row takes
> `userId` as its first parameter and includes it in the `where` clause.
> There is no repository function that can read or write a row without
> being told whose row it is.**

Reads are `findFirst({ where: { id, userId } })`, never
`findUnique({ where: { id } })`. Writes are `updateMany`/`deleteMany`
scoped by `{ id, userId }`, branching on `count`. A missing row and
another user's row are **indistinguishable to the client**, at every
layer and on every surface. `src/server/repositories/company-repository.ts`
is the shape to copy.

All five new models carry their own `userId` column. `Task` carries one
even though it could reach a user through `Project`, for the reason
Phase 3 §5.1(a) gave for `ResumeVersion`: it keeps the rule mechanical.
`where: { id, userId }` is a scalar filter the type system enforces;
`where: { id, project: { userId } }` is a relation filter a future edit
can drop without anything complaining — and a Task with no project
cannot be reached that way at all.

### 6.2 Cross-entity guards — four new ones, and the line that decides

Repository scoping **cannot** protect a write that stores a
client-supplied foreign id. The row being written is the caller's own,
so it carries the caller's own `userId`, so every `where: { userId }`
clause matches. The foreign id rides along unchecked. This class of hole
has been found in this codebase three times — `assertCompanyOwned`
(`application-service.ts`), `assertResumeVersionOwned` and
`assertResumeOwned` (`resume-service.ts`) are the three fixes.

Phase 5 adds four relations, so it adds four guards:

| Write | Client-supplied foreign id | Guard | Lives in |
|---|---|---|---|
| create/update Task | `projectId` | `assertProjectOwned` | `project-service.ts` (exported) |
| create/update Task | `applicationId` | `assertApplicationOwned` | `application-service.ts` (new export) |
| triage QuickDrop → Task | both of the above | the same two, via `task-service` | — |
| triage QuickDrop → Project/Link | none stored | — | — |

`assertApplicationOwned` is new work in `application-service.ts`: that
module today has `assertCompanyOwned` as a private function and no
exported ownership assertion. It gets one, shaped like
`resume-service.ts`'s exported `assertResumeVersionOwned`, and
`task-service.ts` imports it — the same service-to-service direction
`application-service.ts` already uses to import from `resume-service.ts`.

Both guards are called on **create and on update**, and are **skipped
when the id is `undefined`**, because unlinking is always allowed —
identical to `assertLinkedResumeVersionOwned`'s contract today.

**The line that decides whether a guard is needed.** A write needs a
cross-entity guard when it **stores a foreign id**. A write that merely
addresses the caller's own row by `{ id, userId }` does not: the worst a
forged id can do there is match nothing. This matters concretely in one
place — triaging a QuickDrop item deletes it by
`deleteMany({ where: { id, userId } })` inside the same transaction that
creates the target row, and that delete needs no guard. The *create*
half does, when it carries a `projectId` or an `applicationId`.

**Every guard must be called, and the test must prove the call site.**
A guard with a passing unit test and no call site has shipped in this
codebase before. So the guard tests in §12.4 exercise the **public
service function** — `createTask`, `updateTask`, `triageQuickDropToTask`
— never the assertion directly. A test that imports the guard and calls
it proves the guard works; it does not prove the feature uses it.

### 6.3 The `undefined` trap, and the one place `undefined` is correct

Prisma reads `undefined` as *"leave this column unchanged"*. An optional
field passed straight through on an update path therefore **cannot be
cleared** — the write succeeds, the UI reports success, and the old
value is still there. `application-repository.ts` and
`resume-repository.ts` both carry the fix and the comment explaining it.

Every optional column on every update path in this phase maps through
`?? null`:

| Repository | Fields requiring `?? null` on update |
|---|---|
| `project-repository` | `description`, `url` |
| `task-repository` | `notes`, `dueDate`, `projectId`, `applicationId` |
| `link-repository` | `description` |
| `credential-repository` | `siteUrl`, `username`, `notes` |

`quick-drop-repository` has no update path at all — an inbox item is
created, converted, or deleted, never edited (§8.5).

§12.4 requires, for each of those fields, a test that **sets it, clears
it, and re-reads null**. "The mapping is present" is not the assertion;
"the clear actually cleared" is.

**The one exception, and it is deliberate.** On
`updateCredential`, an absent or empty `secret` means *"leave the stored
password alone"* — and here `undefined` meaning "don't change" is
exactly right. Editing a credential's label must not require re-typing
the password, and there is no way to clear a secret to empty: a
credential without a password is deleted, not blanked (the three secret
columns are non-nullable, §9.3). So `credential-repository.update` takes
the secret as a **separate optional argument** rather than as part of
the data object, and writes the three columns only when it is present.
This is called out here because it looks like the bug above and is not;
§12.4 pins it with a test asserting that renaming a credential leaves
`secretCiphertext` and `secretNonce` **byte-identical**.

### 6.4 Folder structure (additions only)

```
src/
  app/(app)/
    projects/
      page.tsx                     # table + status filter
      loading.tsx
      actions.ts
      project-table.tsx
      project-sheet.tsx            # create/edit (client)
      delete-project-dialog.tsx
      [id]/
        page.tsx                   # detail + its tasks
        loading.tsx
        not-found.tsx
        project-task-list.tsx
    tasks/
      page.tsx                     # the task list, URL-driven filters
      loading.tsx
      actions.ts
      search-params.ts             # + .test.ts, following applications/
      due-date.ts                  # + .test.ts (§7.5)
      task-list.tsx                # client: buckets + headers
      task-row.tsx
      quick-add-task.tsx           # title-only inline create
      task-sheet.tsx               # full create/edit (client)
      delete-task-dialog.tsx
    links/
      page.tsx
      loading.tsx
      actions.ts
      link-table.tsx
      link-sheet.tsx
      tag-filter.tsx
      delete-link-dialog.tsx
    quickdrop/
      page.tsx
      loading.tsx
      actions.ts
      quick-drop-list.tsx
      quick-drop-row.tsx
      triage-menu.tsx
    credentials/
      page.tsx
      loading.tsx
      actions.ts
      credential-table.tsx
      credential-sheet.tsx         # create/edit (client)
      reveal-credential-dialog.tsx # step-up + reveal (client, §9.7)
      reencrypt-button.tsx         # §9.5
      delete-credential-dialog.tsx
  components/
    tag-input.tsx                  # extracted from skills-editor.tsx
    layout/
      quick-drop-capture.tsx       # topbar button + capture sheet
    ui/
      checkbox.tsx                 # generated
  server/
    crypto/
      secret-box.ts                # + .test.ts — pure AES-256-GCM
      credentials-key.ts           # + .test.ts — env loading, key ids
    repositories/
      project-repository.ts        # + .test.ts
      task-repository.ts           # + .test.ts
      link-repository.ts           # + .test.ts
      quick-drop-repository.ts     # + .test.ts
      credential-repository.ts     # + .test.ts
    services/
      project-service.ts           # + .test.ts
      task-service.ts              # + .test.ts
      link-service.ts              # + .test.ts
      quick-drop-service.ts        # + .test.ts
      credential-service.ts        # + .test.ts
    validators/
      project-schemas.ts           # + .test.ts
      task-schemas.ts              # + .test.ts
      link-schemas.ts              # + .test.ts
      quick-drop-schemas.ts        # + .test.ts
      credential-schemas.ts        # + .test.ts
      url.ts                       # + .test.ts — shared, §12.1
      tags.ts                      # + .test.ts — shared, §12.1
      limits.ts                    # two text-length constants
e2e/
  productivity.spec.ts
```

Modified: `prisma/schema.prisma`, `src/lib/db/prisma.ts`,
`src/config/site.ts`, `src/proxy.ts`, `src/app/(app)/layout.tsx`,
`src/components/layout/{app-shell,topbar,sidebar-nav}.tsx`,
`src/app/(app)/applications/{page,application-table}.tsx`,
`src/app/(app)/resumes/[id]/skills-editor.tsx`,
`src/server/services/application-service.ts`,
`src/server/validators/{company,application,resume}-schemas.ts`,
`.env.example`.

**A naming collision to know about before it is discovered.** This phase
adds `Project`, and `ResumeProject` already exists. They are different
things: a `ResumeProject` is a line *on a resume*, ordered, owned by a
resume slot; a `Project` is a piece of work the user is *doing*. Both
end up with a `delete-project-dialog.tsx`, in
`app/(app)/resumes/[id]/` and `app/(app)/projects/` respectively. The
files are distinguished by directory and the models by name, and §7.2
records why they are not linked.

## 7. Database schema

```prisma
enum ProjectStatus {
  IDEA
  ACTIVE
  PAUSED
  DONE
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

model Project {
  id          String        @id @default(cuid())
  userId      String
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)
  url         String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@unique([userId, name])
  @@index([userId, status])
}

model Task {
  id            String     @id @default(cuid())
  userId        String
  title         String
  notes         String?
  status        TaskStatus @default(TODO)
  /// A calendar date, not an instant. Stored as a Postgres DATE and
  /// always read and written at UTC midnight — see §7.5.
  dueDate       DateTime?  @db.Date
  /// Set by the service when status becomes DONE, cleared when it leaves.
  /// Never accepted from the client. `updatedAt` cannot answer "what did I
  /// finish last week" because any edit moves it.
  completedAt   DateTime?
  projectId     String?
  applicationId String?
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  project     Project?     @relation(fields: [projectId], references: [id], onDelete: SetNull)
  application Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)

  @@index([userId, status, dueDate])
  @@index([userId, projectId])
  @@index([userId, applicationId])
}

model Link {
  id          String   @id @default(cuid())
  userId      String
  title       String
  url         String
  description String?
  /// Short free-text tags with no attributes of their own, so a Postgres
  /// array rather than a join table — the same call Resume.skills made,
  /// and the same `has`/`hasSome` query shape.
  tags        String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

/// An untriaged capture: one line of text or a pasted URL, and nothing
/// else. It leaves this table by being converted into a Task, Link or
/// Project, or by being dismissed. There is no edit operation and no
/// archive — an inbox whose items never leave stops being an inbox.
model QuickDropItem {
  id        String   @id @default(cuid())
  userId    String
  content   String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

/// A login for a third-party site. The password is AES-256-GCM
/// ciphertext and the three secret columns are NON-NULLABLE by design:
/// there is no representable row that holds a plaintext or absent
/// secret, so "store it unencrypted instead" is not a state this schema
/// can reach. See §9.
model Credential {
  id               String   @id @default(cuid())
  userId           String
  label            String
  siteUrl          String?
  /// Plaintext, deliberately: the list view identifies a record by it,
  /// and encrypting it would force a decrypt on a list render — which is
  /// the one thing §9.6 forbids. §9.10 states the consequence.
  username         String?
  /// Plaintext. The form's help text says so. Not a second secret slot.
  notes            String?
  secretCiphertext Bytes
  /// 12 bytes, fresh on every encryption. Never reused (§9.3).
  secretNonce      Bytes
  /// 16 bytes from GCM. Stored separately from the ciphertext because
  /// Node's API produces and consumes it separately.
  secretAuthTag    Bytes
  /// Which key this row is encrypted under: the first 8 bytes of
  /// SHA-256 over the key, hex. Derived, never configured, so it cannot
  /// drift from reality the way a hand-maintained version number can.
  keyId            String
  /// When the SECRET last changed — not the row. Editing a label must
  /// not look like a password change.
  secretUpdatedAt  DateTime @default(now())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, label])
  @@index([userId])
}
```

`User` gains five back-relations: `projects`, `tasks`, `links`,
`quickDropItems`, `credentials`. `Application` gains one: `tasks`.

Migration name: `add_productivity_models`. It is additive throughout —
five new tables, two new enums, no change to an existing column, no
backfill. Run it with **`pnpm exec prisma migrate dev --name
add_productivity_models`** and then **`pnpm exec prisma generate`**:
`migrate dev` does not reliably regenerate the client in this project,
and a stale client is a type error in a file nobody edited. `pnpm exec`,
never `pnpm dlx`.

### 7.1 Decisions embedded above, and why

- **`ProjectStatus` has four members and no `ARCHIVED`.** Archiving is a
  Phase 2 §3 non-goal that has not become more necessary. `DONE` is the
  terminal state and delete is the other one. `IDEA` earns its place
  because the triage path from QuickDrop lands there — "spin up a
  portfolio site" is an idea before it is active, and collapsing the two
  would make every triaged project look started.
- **`TaskStatus` has three members and no `BLOCKED`.** Blocked is a
  sentence, and `notes` is where sentences go. A blocked column is a
  project-management affordance for a list one person reads.
- **No `position` on `Task`.** Matching Phase 2 §8's decision for the
  board: hand-ordering means a fractional index maintained on every
  drag plus rebalancing. Tasks sort by due date (§8.3).
- **No `priority` on `Task`.** §3.
- **`completedAt` is service-owned.** It is not in any Zod schema and no
  action accepts it. Phase 6 wants "tasks completed per week" and
  `updatedAt` cannot answer that; Phase 3 §9's honesty constraint is the
  precedent — a metric that silently means something else is worse than
  no metric.
- **`Link.title` is required.** A list of bare URLs is a list the user
  cannot scan. The create form pre-fills the title from the URL's host
  on the client as a convenience; the server has no such default and
  rejects a blank title, exactly as Phase 3 §7 does for a version label.
- **`Link` has no unique constraint on `url`.** §3, with the
  canonicalisation reasoning.
- **`Link.tags` is a Postgres array, not a join table**, following
  `Resume.skills`. No GIN index this phase: the tag filter is a `has`
  over a `userId`-scoped subset that is hundreds of rows on a personal
  account, and `Resume.skills` set the same precedent. If it ever gets
  slow, a GIN index on `tags` is an additive fix that changes no code.
- **`QuickDropItem` has one content column and no `kind`.** Whether an
  item is a URL is computable from `content` in one line (§12.1's
  `isHttpUrl`), and a stored classification is a second source of truth
  for a derived fact.
- **`QuickDropItem` has no `triagedAt`/`triagedIntoId`.** Conversion
  deletes the row (§8.5). The alternative — keeping it with a pointer at
  what it became — needs a polymorphic foreign key (`type` + `id`) with
  no referential integrity, to power an archive nobody opens.
- **`Credential` is unique on `[userId, label]`**, matching `Company`
  and `Resume`. Two rows labelled "Workday" is a list the user cannot
  use; the fix is to name them "Workday — Acme" and "Workday — Globex".
- **`Credential.keyId` rather than a `keyVersion` integer.** A version
  number is configuration a human maintains and can therefore get wrong
  — set the wrong number during a rotation and rows are attempted
  against the wrong key. A truncated hash of the key itself is derived
  from the only thing that matters, and answers "which key does this row
  need" exactly. §9.5 uses it for both decryption routing and the
  re-encryption count. Truncating to 8 bytes of SHA-256 over a 256-bit
  key is not a practical oracle for the key.

### 7.2 `Project` and `ResumeProject` are not linked

A "promote this project to my resume" button is an obvious idea and it
is deliberately not built. `ResumeProject` hangs off a resume *slot*,
carries a `position` the user controls, and is worded for a reader who
is hiring. A `Project` is worded for the person doing it. A link between
them would immediately raise "does editing one edit the other", and
either answer is bad: *yes* makes the resume text change when a private
note is edited, *no* makes a link that means nothing.

If it is ever wanted, the additive form is a nullable `projectId` on
`ResumeProject` used purely as provenance, plus a guard. Recorded as a
deferral, not discovered as one.

### 7.3 Tasks attach to Applications — the decision, and why

**Decision: yes.** `Task.applicationId` exists, nullable, guarded.

The product is a job-search tracker. "Send follow-up to Acme", "prepare
system-design round for Globex", "chase the recruiter about the offer
deadline" are not incidental to it — they are the highest-value tasks
the app will ever hold, and every one of them is *about* a row that
already exists in this database.

Without the link, that task is a string that happens to contain the word
"Acme". It cannot be listed next to the application, it cannot be
counted, it duplicates the company and role in its own title, and it
goes stale silently when the application's role title is corrected. With
the link it is one nullable column, one index, and one guard — the
cheapest relation in this phase.

The alternative considered was **tasks on Companies instead**. Rejected:
the unit of a job search is the application, not the company. A
follow-up belongs to one application at one company, and two concurrent
applications to the same company would share a task list that means
nothing.

**Where it surfaces**, kept deliberately small:

- `/tasks?application=<id>` filters to one application's tasks, with a
  chip naming it.
- The applications **table** gains one narrow, right-aligned **Tasks**
  column: the count of that application's non-`DONE` tasks, as a link to
  the filtered list; blank at zero, `tabular-nums` like the rest of the
  table. It is computed for the whole page in **one grouped query**
  (`groupBy({ by: ["applicationId"], where: { userId, status: { not: "DONE" } } })`),
  not per row — the same shape as Phase 3 §9's stats query, for the same
  reason.
- The **board is not changed.** Phase 3 declined a fourth line on a card
  at the column widths recorded in `docs/superpowers/ui-followups.md`,
  and nothing since has made those columns wider.
- A task row anywhere shows its context as a chip: the project name, or
  `<company> · <role>`, or nothing.

### 7.4 What deletion does — one rule, stated once

> **Deleting something a task points at never deletes the task.** The
> task is unlinked and stays visible in the list; its text survives.

`Task.project` and `Task.application` are both `onDelete: SetNull`.

This diverges from `onDelete: Restrict` on `Application.company` (Phase
2) and `Application.resumeVersion` (Phase 3), and the divergence is the
point. Those two protect **history** — which company an application was
at, which file was actually sent — and that information cannot be
recreated once it is gone, so the delete is refused and the user is told
the count. A task pointing at a deleted project loses only **context**,
and the sentence the user typed is still there. Refusing a delete to
protect a recoverable fact is friction; destroying user-written text as
a side effect of deleting something else is worse than either.

So the rule for this phase is: never destroy user-written text as a side
effect, and never refuse a delete to protect context.

It is **not silent**. Both confirmation dialogs name the consequence
before it happens:

- Project delete: *"Delete "Portfolio site"? 14 tasks will move to No
  project. This can't be undone."*
- Application delete (existing dialog, one line added): *"3 tasks will
  be unlinked."*

Both counts come from a `count` in the service that renders the dialog,
so a zero-task project shows the plain message with no clause.

`User` cascades to all five tables, matching every earlier phase.

### 7.5 `dueDate` is a calendar date, and this is where timezones are settled

A due date is **a day**, not an instant. "Due 14 September" must not
become 13 September because the reader is in UTC-8, and must not shift
when the user travels.

- The column is `DateTime? @db.Date` — a Postgres `DATE`. Prisma reads
  it back as a JS `Date` at **UTC midnight**.
- `<input type="date">` submits `YYYY-MM-DD`. The schema parses that
  string explicitly — a `^\d{4}-\d{2}-\d{2}$` match, then
  ``new Date(`${value}T00:00:00.000Z`)`` — rather than `z.coerce.date()`,
  so the value's interpretation is written down instead of inherited
  from a JS parsing rule.
- Rendering uses **UTC getters only**, in `tasks/due-date.ts`. A
  `toLocaleDateString()` with default options on a UTC-midnight `Date`
  prints the previous day for every reader west of Greenwich. Its unit
  test runs with `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata` and
  asserts the same output from both.
- There is **no future/past restriction**. `Application.appliedAt`
  rejects future dates because it records something that happened; a due
  date in the past is not invalid, it is overdue — which is the single
  most useful thing the list can tell you.

**"Today" is the reader's today, so the client owns the buckets.** The
server sorts by `dueDate` ascending with nulls last and renders a flat
list. The client component inserts the group headers — **Overdue**,
**Due today**, **This week**, **Later**, **No due date** — from the
browser's local date after mount. No row moves when the headers appear,
because ascending due date is already exactly bucket order; only headers
are inserted. That is why this is not the hydration mismatch Phase 2 hit
with dnd-kit: the server and the client render the same rows in the same
order, and the client adds to the tree rather than reordering it.

Storing the user's IANA timezone on `User` would let the server bucket
correctly, and is recorded in §13 as the deferral it is.

## 8. Pages & flows

Every page reuses the shared `PageHeader` and `EmptyState`, every list
gets a real empty state rather than headers over nothing, every mutation
is a Server Action followed by `router.refresh()`, and every destructive
action is behind an `AlertDialog`. The palette and type are the
Atlassian Design System tokens and Inter already in `globals.css`.

Two primitive conventions, verified in this repo and easy to get
backwards: **Base UI** components (`sheet`, `dropdown-menu`, `sidebar`)
take `render={<El/>}`, with the trigger typed `React.ReactElement` — as
`resume-sheet.tsx` does with `<SheetTrigger render={trigger} />`.
**Radix** components (`select`, `alert-dialog`, and the new `checkbox`)
take `asChild`.

### 8.1 Projects (`/projects`)

A table matching `/companies` and `/resumes`: **Name**, **Status**
(lozenge), **Open tasks**, **Updated**. Status filter in the URL
(`?status=ACTIVE`), following Phase 2's table. The row links to the
detail page.

Create and edit in a `Sheet`: name, description, status, url. Delete
behind an `AlertDialog` carrying the §7.4 sentence.

Empty state: what a project is for, and a button that opens the create
sheet — with one line distinguishing it from a job application, because
the sidebar now has both and the distinction is the phase's main
vocabulary risk.

### 8.2 Project detail (`/projects/[id]`)

Header (name, status lozenge, link when set, edit, delete), description,
then the project's tasks — the same row component as `/tasks`, with an
inline quick-add that pre-fills `projectId`. A project id that does not
exist *or is not yours* renders the same `not-found.tsx`.

### 8.3 Tasks (`/tasks`)

The home for every task, whatever it is attached to.

- **Quick add** at the top: one text input. Enter creates a `TODO` task
  with that title and nothing else, clears the field and keeps focus.
  This is the same capture-speed argument as QuickDrop, applied where
  the user already knows it is a task.
- **The list**, sorted and bucketed per §7.5. Each row: a `checkbox`, the
  title, the context chip (§7.3), the due date as `<time dateTime>`
  styled by bucket, and a row menu (Edit, Delete).
- **The checkbox** toggles `DONE`. Checking sets `completedAt`;
  unchecking clears it and returns the task to `TODO` — **not** to
  `IN_PROGRESS`. A two-state control cannot restore a three-state field,
  and a `previousStatus` column to remember it would be a memory of
  something nobody asked for. `IN_PROGRESS` is set in the sheet.
- **Filters in the URL**, matching Phase 2's table so a filtered list can
  be linked and survives a refresh: `?status=`, `?project=`,
  `?application=`, `?tag=` is not offered (tags are a Link concept).
  Completed tasks are excluded by default and reachable at
  `?status=DONE`. Parsing lives in `tasks/search-params.ts` with unit
  tests, and it **validates against the enum rather than testing `in`** —
  Phase 2's `parseStatus` accepted `?status=toString` through the
  prototype chain and that parked Minor became a 500 the moment a later
  feature indexed with it.
- **Full edit** in a `Sheet`: title, notes, status, due date, project,
  application. Project and application are two Radix selects, each with
  a "None" option submitting `""` → `undefined` (§12.1).

Empty state: what the list is for, with the quick-add still visible —
the affordance that makes the state stop being empty should not be
hidden behind the state.

### 8.4 Links (`/links`)

A table: **Title** (linking out), **URL** (host only, so the column does
not blow the layout out), **Tags** (chips), **Added**. Tag filter in the
URL (`?tag=`), rendered as the same chips, with the active one marked.

Every outbound link is `target="_blank" rel="noopener noreferrer"`, and
the stored URL has already been restricted to `http:`/`https:` by the
schema (§12.1). Both controls are needed: the scheme check is what stops
`javascript:` reaching an `href`, and `rel` is what stops the opened tab
reaching back through `window.opener`.

Create and edit in a `Sheet`: url, title, description, tags via the
extracted `TagInput`.

### 8.5 QuickDrop — capture anywhere, triage at `/quickdrop`

**Capture** lives in the topbar, on every page in the app shell:
`quick-drop-capture.tsx` is a button that opens a `Sheet` with one
autofocused textarea and one submit. On success the sheet **stays open
with the field cleared and refocused**, so a second capture is
immediate, and a `sonner` toast confirms. `router.refresh()` runs after
each success, which is also what updates the sidebar count.

**No global keyboard shortcut this phase.** A global key handler has to
coexist with every text input in the app and with the global search a
later phase will want, and the two bindings should be chosen together by
whoever builds the second one. The button is one click from anywhere.
Recorded in §13.

**The inbox** at `/quickdrop`: the same capture field at the top, then
pending items newest first. Each row shows the content — rendered as an
anchor **only** when it parses as an `http:`/`https:` URL, otherwise as
plain text, which is the same `javascript:` control as §8.4 applied to a
free-text field — its capture time, and a triage menu.

**Triage** offers, via a `dropdown-menu`:

| Action | Result |
|---|---|
| **Task** | Opens the task sheet with `title` pre-filled from the content. |
| **Link** | Opens the link sheet with `url` pre-filled. Offered **only** when the content is an http/https URL. |
| **Project** | Opens the project sheet with `name` pre-filled, status `IDEA`. |
| **Dismiss** | Deletes the item. Behind an `AlertDialog`, because it is the one irreversible option. |

Each triage sheet submits to a dedicated action
(`triageQuickDropToTaskAction` and friends) carrying the item id
alongside the normal payload. The service performs the create and the
delete **in one `prisma.$transaction`**, so a failed create leaves the
item in the inbox rather than losing it. The delete is
`deleteMany({ where: { id, userId } })` and needs no guard; the create
half needs the §6.2 guards when it carries a `projectId` or
`applicationId`.

Empty state: "Nothing waiting. Anything you drop here from the topbar
shows up in this list." — the inbox being empty is success, and the copy
should say so rather than apologise.

### 8.6 Credentials (`/credentials`)

A table: **Label**, **Site** (host, linking out with `rel="noopener
noreferrer"`), **Username** (with a copy button), **Password updated**,
and a **Reveal** button per row. There is no password column and no row
of dots — a row of dots on a page whose HTML does not contain the
password is a small lie, and the button says what actually happens.

Create and edit in a `Sheet`. Delete behind an `AlertDialog` whose copy
says the password cannot be recovered.

Everything about what the Reveal button does, what the form does with
the password, what happens when the key is missing, and what this
feature is and is not — §9.

## 9. Credentials — encryption, reveal, and what this is not

This is the security core of the phase, and the first place in this
product where the data is **not the user's own document but someone
else's authentication material**. Each subsection states what it is
answering.

### 9.1 What the feature is for, and the threat model

The feature stores the login the user created for a company's applicant
tracking system — a Workday account for Acme, a Greenhouse portal for
Globex — because in practice the alternative is a note file or the same
password on twelve portals.

The threat model, stated so the controls can be judged against it:

| Adversary | In scope? |
|---|---|
| Someone who obtains a **database dump** (a backup, a leaked snapshot, a compromised Postgres) | **Yes.** They must not get passwords. §9.2, §9.3. |
| Someone who obtains a **session cookie** (a borrowed laptop, an XSS elsewhere, an unlocked screen) | **Yes.** A session must not be sufficient to exfiltrate the vault. §9.7. |
| Someone reading **application logs, error reports, or URLs** | **Yes.** §9.8. |
| Another **user of this app** | **Yes**, and it is the ownership rule (§6.1), not new machinery. |
| Someone with **shell access to the running server**, or with the environment *and* the database | **No.** §9.10 says so plainly rather than implying otherwise. |
| A **malicious client-side script on this origin** | Partially. It cannot read what the page never received (§9.6), but it could keylog a step-up password. Not solved here. |

### 9.2 The key: `CREDENTIALS_KEY`, and why it is its own key

**A dedicated 256-bit key, supplied in the environment, used for nothing
else.**

```
CREDENTIALS_KEY="<base64 of 32 random bytes>"   # openssl rand -base64 32
```

`src/server/crypto/credentials-key.ts` reads it on first use, base64-
decodes it, and **requires exactly 32 bytes**. It caches the result for
the process. It also computes `keyId` — the first 8 bytes of
`SHA-256(key)`, hex — which is what `Credential.keyId` stores.

Three things it explicitly is not, each for a reason worth writing down:

**It is not `AUTH_SECRET`.** `AUTH_SECRET` signs session tokens. It is
handled by different code with different exposure — read by Auth.js,
carried through `src/proxy.ts`, and printed by Auth.js debug output — and
it is rotated for session-shaped reasons: a suspected token leak, a
library upgrade, a deployment convention. Sharing one secret between
session signing and vault encryption welds two unrelated blast radii
together in both directions: leaking the signing secret would hand over
every stored password, and rotating it (which costs everyone a re-login,
and is therefore a thing you should feel free to do) would silently make
the vault undecryptable. Different lifecycles, different exposure,
different consequences — therefore different keys. A startup check makes
the most likely mistake loud: if `CREDENTIALS_KEY === AUTH_SECRET`, the
key loader throws rather than accepting the copy-paste.

**It is not derived from the database.** No key column, no per-user salt
row, no `pgcrypto`, no KDF over anything stored. The entire value of
encrypting at rest is that **a database dump is not sufficient to
decrypt** — and a key derived from a value inside the dump makes the
dump self-decrypting, which is encryption as decoration. The key
material must live somewhere the database is not, and for this
deployment that is the process environment.

**It is not derived from the user's password** — the strongest
alternative, and §9.9 explains why it is deferred rather than dismissed.

### 9.3 The record: AES-256-GCM, one fresh nonce per encryption

`src/server/crypto/secret-box.ts` is pure: `Uint8Array` in,
`Uint8Array` out, no Prisma, no `fs`, no framework import, no `console`
call anywhere in the file. It is a unit-test target in the same way
`src/server/files/pdf.ts` is.

```ts
export type SealedSecret = {
  ciphertext: Uint8Array
  nonce: Uint8Array   // 12 bytes
  authTag: Uint8Array // 16 bytes
  keyId: string
}

export function seal(plaintext: string, userId: string): SealedSecret
export function open(sealed: SealedSecret, userId: string): string
```

- **Algorithm: `aes-256-gcm`**, via
  `createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 })`.
  GCM is authenticated: `open` on a tampered ciphertext **throws**
  rather than returning plausible garbage, which is the property that
  makes a database-write adversary detectable instead of silent.
- **The nonce is 12 bytes from `randomBytes(12)`, generated inside
  `seal`, on every single call.** There is no parameter that lets a
  caller supply one and no code path that reads a stored nonce back into
  an encryption. Under GCM, reusing a nonce with the same key is not a
  weakness, it is a break — an attacker with two ciphertexts under one
  nonce recovers the XOR of the plaintexts and can forge tags. Updating
  a credential's password re-encrypts with a **fresh** nonce; so does
  the re-encryption in §9.5, even though it uses a different key and the
  old nonce would technically be safe there, because "reuse a nonce"
  should not appear as a pattern in this codebase at all.
  At 96 random bits, a 2^-32 collision probability needs roughly 2^32
  encryptions; a personal vault will see thousands. This is a judgement
  with a number behind it, not a hope.
- **The auth tag is stored in its own column** because Node's API
  produces it separately (`cipher.getAuthTag()`) and consumes it
  separately (`decipher.setAuthTag()`). Concatenating and re-splitting
  would be one more place to get an offset wrong.
- **Additional authenticated data binds the record to its owner:**
  ``setAAD(Buffer.from(`credential:v1:${userId}`))``. The effect is that
  a ciphertext copied from user A's row to user B's row **fails to
  open**, rather than decrypting under B's account. The `v1` prefix
  means a future change to the AAD shape is detectable rather than
  silently breaking every row. This defends against an adversary with
  database write access; it does nothing against one who also controls
  the application, and is not claimed to.
- **No per-record salt.** GCM with a random 96-bit nonce needs none; the
  nonce *is* the per-record unique value.
- **The plaintext is capped at 512 characters** by the schema. An
  unbounded secret column is a blob column with a misleading name.
- **The three secret columns are non-nullable** (§7). There is no
  representable `Credential` row without a ciphertext, so the failure
  mode "the key was missing so we stored it in plaintext" is not a state
  this schema can express.

### 9.4 When `CREDENTIALS_KEY` is missing or malformed

This is the case where a quiet fallback would be catastrophic, so the
behaviour is specified exactly:

**`getCredentialsKey()` throws `CredentialsKeyUnavailableError`. There is
no fallback of any kind** — not `AUTH_SECRET`, not a build-time default,
not a random per-process key, and above all not "store the plaintext and
carry on". The error is typed, its message is fixed, and it contains no
key material and no environment values.

What that means at each layer:

| Path | Behaviour |
|---|---|
| **Create / update a credential** | `seal` is called *before* any row is written, so the throw happens before the insert. Nothing is persisted. The action returns a form error: *"Credential storage isn't configured. Set CREDENTIALS_KEY."* |
| **Reveal** | Same error, same message. Nothing is decrypted because nothing can be. |
| **List `/credentials`** | **Still renders.** Listing labels, sites and usernames needs no key, and taking the page away tells the user less than showing them what is in the vault. Every Reveal button is `disabled`, and a banner names the missing variable. |
| **Delete** | Works. Deleting a row you can no longer read is a reasonable thing to want. |
| **The rest of the app** | Unaffected. |

**Why not fail at process start**, the way `getStorage()` throws on an
unknown `STORAGE_DRIVER` (Phase 3 §5.2)? Because that check guards a
mis-*configuration* — a typo that would write production resumes to an
ephemeral disk — whereas this one guards an *absent optional feature*.
Refusing to boot the job tracker because the password vault is not
configured is disproportionate for a personal app, and the failure here
is fully contained: it is loud, it is at the boundary, and it cannot
degrade into writing plaintext because §9.3's schema makes plaintext
unrepresentable.

A **malformed** key — not base64, or the wrong decoded length, or equal
to `AUTH_SECRET` — throws the same typed error to the client and logs a
distinct, specific reason server-side. The client never learns which.

### 9.5 Rotation

`Credential.keyId` is what makes rotation possible at all: every row
records which key it needs.

**The procedure.**

1. Generate a new key. Move the old value to `CREDENTIALS_KEY_PREVIOUS`
   and put the new one in `CREDENTIALS_KEY`. Deploy.
2. Every read now resolves its key by `keyId`: current key, else
   previous key, else **fail** (see below). Existing rows keep working.
3. `/credentials` notices that `count({ userId, keyId: { not:
   currentKeyId } })` is non-zero and shows *"12 passwords are still
   encrypted with the previous key"* with a **Re-encrypt** button. The
   action walks that user's rows, `open`s each with its own key and
   `seal`s it under the current one **with a fresh nonce**, in a
   transaction per row.
4. When the count reaches zero, remove `CREDENTIALS_KEY_PREVIOUS`.

**Reveal is a read and does not write.** Lazy re-encryption on reveal
was considered and rejected: a read path that writes can fail for a
write reason, which turns "show me my password" into an operation that
can fail because of a database constraint. The explicit bulk action is
the only re-encryption path.

**If a key is lost — no previous key set, and rows encrypted under it —
the data is gone, and the app says so.** `open` fails, the service
throws `CredentialUndecryptableError`, and the UI shows, on that row:
*"This password was encrypted with a different key and can't be read.
Restore the previous CREDENTIALS_KEY, or delete this record."* The row
is **never** silently deleted, never overwritten, and never shown as
blank — a blank field would read as "there is no password here", which
is the wrong thing to believe. `/credentials` also surfaces the count of
unreadable rows at the top, so the situation is visible on arrival
rather than discovered one row at a time.

### 9.6 The plaintext is never sent to the client on a list or a detail view

This is structural, not a convention two layers apart agreeing to
behave. Two independent controls, in the style of Phase 3 §8.1:

**Control 1 — the ciphertext never leaves the database on a read path.**
`src/lib/db/prisma.ts` declares a client-level omit:

```ts
new PrismaClient({
  adapter,
  // Deny by default: these three columns are excluded from every query
  // in the app unless a query opts back in. The one query that opts in
  // is credentialRepository.findSealedById.
  omit: {
    credential: {
      secretCiphertext: true,
      secretNonce: true,
      secretAuthTag: true,
    },
  },
})
```

Being client-level rather than per-query is the point: it also covers a
future `include: { credentials: true }` on a user query written by
someone who has never read this document.

`credential-repository.ts` then exposes exactly two read shapes:

- `listByUser(userId)` and `findById(userId, id)` — the list and edit
  paths. They return rows with no secret columns, because the columns
  were never selected.
- `findSealedById(userId, id)` — the **only** function in the codebase
  that re-includes them, with
  `omit: { secretCiphertext: false, secretNonce: false, secretAuthTag: false }`.
  It is called from exactly one place: the reveal path in
  `credential-service.ts`.

**Control 2 — decryption happens in one function, on one path.**
`credential-service.open` is the only caller of `secretBox.open`. There
is no service function that returns a `Credential` *with* a plaintext
field; the reveal path returns a bare `string` to its action and
nothing else, so a plaintext cannot be accidentally spread into a row
object that a page then passes to a component as a prop.

The consequence, stated as the property to test: **the HTML of
`/credentials` does not contain any stored password, in any encoding.**
§12.4 asserts it end to end with
`expect(await page.content()).not.toContain(secret)`.

There is no credential detail page (§8.6) — the edit sheet is the only
per-record surface, and its password field renders **empty**, never
pre-filled with the current value. An empty field in an edit form means
"leave it alone" (§6.3), which is also the safest default.

### 9.7 Reveal is a separate, separately authorised action

```ts
type RevealResult =
  | { success: true; secret: string }
  | { success: false; fieldErrors?: …; formError?: string }
```

- It is a **POST-only Server Action**, `revealCredentialAction({ id,
  password })`. There is no route handler, no `GET`, and no URL that
  returns a secret.
- It gets its own result type, declared locally in
  `credentials/actions.ts`. The shared `ActionResult` in
  `@/types/action-result` is deliberately **not** widened to carry a
  data payload: making every action in the app capable of returning data
  to make one action able to is exactly backwards.
- Like every action in this codebase, it calls `auth()` itself and
  returns `{ success: false, formError: "Unauthorized." }` without a
  session. Route protection guards navigation; actions guard data. The
  user id comes from `session.user.id` and never from the payload.
- **It requires the account password.** The reveal dialog asks for it and
  the action verifies it with the existing argon2id `verifyPassword`
  against `user.hashedPassword` before decrypting anything.

**Why a step-up.** It makes the property in §9.1 true: **a session is not
sufficient to exfiltrate the vault.** A borrowed laptop with a logged-in
tab, a stolen session cookie, or a CSRF-shaped trick against a logged-in
user gets the attacker a list of labels and usernames and nothing else.
It is also the only option that adds no new secret, no new token format,
and no new table.

**Every reveal asks again.** There is deliberately no unlock window. A
window means storing "this session is unlocked until T" somewhere —
a signed cookie (which needs a signing secret, and the only one around
is `AUTH_SECRET`, which §9.2 just finished separating) or a server-side
record (a new table for a convenience). The cost is typing a password
each time you reveal, which for a vault of a few dozen portal logins is
a trade worth making. It is recorded in §13 as the most likely thing to
be revisited, with what it would need.

**Brute force.** Guessing at this endpoint is guessing the account
password, against argon2id, one request at a time — the same exposure
the login form already has, and argon2id is what makes it expensive.
Per-account lockout and rate limiting are Phase 7 (Phase 1 §3 scoped
rate limiting there); this is the place that records the reveal action
as one of the endpoints that will need it. A wrong password returns a
field error on the password field and **no** information about the
credential.

**On screen.** The revealed value appears as selectable text with a
**Copy** button, and is dropped from component state after **30
seconds** (the timer is cleared on unmount, and the value is not
retained anywhere else). `router.refresh()` is **not** called on reveal
— there is nothing to revalidate, and a refresh would re-render the tree
while a secret is in it. Closing the dialog clears it immediately.

The clipboard, once the user copies, is outside this app's control and
readable by other software on the machine. That is a real exposure and
it is stated rather than papered over; no clipboard-clearing timer is
attempted, because it does not work reliably across browsers and would
be a guarantee we cannot keep.

### 9.8 Never logged, never in an error message, never in a URL

Rules with teeth, each one checkable:

- **`secret-box.ts` contains no `console` call at all**, and neither does
  `credentials-key.ts`. Nothing in either file can print key material or
  plaintext because neither file can print.
- **No error thrown on the credentials path interpolates any input.**
  Every error is a typed class with a fixed message —
  `CredentialsKeyUnavailableError`, `CredentialUndecryptableError`,
  `CredentialNotFoundError`, `CredentialLabelTakenError`,
  `InvalidAccountPasswordError`. A message that embedded the value being
  encrypted is how a plaintext reaches a log aggregator.
- **Service-side logging identifies rows, never contents.**
  `console.error("Failed to decrypt credential", credential.id)` — the
  id, the `keyId` at most, never the ciphertext, never the nonce, never
  the plaintext, never the key.
- **Nothing secret is ever in a URL.** No query parameter, no path
  segment, no redirect target. URLs reach browser history, server access
  logs and `Referer` headers. The reveal action is a POST; the vault
  pages take no secret-bearing parameters.
- **The create/edit password input is `type="password"` with
  `autoComplete="new-password"`**, so the browser's own password manager
  does not offer to save a third party's credential into the user's
  browser profile as though it belonged to this site.
- **The credentials pages are dynamic and uncached.** They call `auth()`,
  which reads cookies, which makes the route dynamic in Next.js; no
  `revalidate` is set on them and no route handler exists to need cache
  headers. Stated so that a later "let's cache the list" change has to
  argue with this paragraph first.

### 9.9 Alternatives considered

- **A key derived from the user's own password** (PBKDF2/argon2 over the
  login password, held only for the session). Genuinely stronger: the
  server would hold no key at rest, and a database dump *plus* the
  environment would still yield nothing. Rejected for this phase for
  three concrete reasons: changing the account password would require
  re-encrypting every credential inside the password-change transaction
  (and failing that transaction halfway is unrecoverable); a forgotten
  password would destroy the vault with no recovery path in an app that
  has no password reset at all yet (Phase 1 §3); and holding a derived
  key across requests needs a place to put it, which is the same
  server-side session store §9.7 declined. §9.7's step-up buys a
  meaningful part of the same benefit — session ≠ vault — at a fraction
  of the cost. Recorded in §13.
- **Client-side encryption** (the browser encrypts before the payload is
  sent). Would remove the server from the trust boundary entirely, and
  would mean a Web Crypto key stored in the browser, lost on every new
  device, and a vault that cannot be read from a second machine.
  Disproportionate for a single-user personal app.
- **`pgcrypto` / column encryption in Postgres.** The key ends up in the
  database's configuration or in the SQL statement. The dump adversary
  §9.1 names is the whole point, and this control does not answer them.
- **Encrypting `username` and `notes` too.** Rejected because the list
  view identifies a record by its username, so it would force a decrypt
  on every list render — the exact thing §9.6 is built to prevent. The
  cost of that choice is stated in the next section rather than hidden.

### 9.10 Residual risk, stated plainly

**What this feature does not do.**

- The key sits in the environment of the same process that reads the
  database. **Anyone with shell access to the running server, or with
  both an environment dump and a database dump, can decrypt every stored
  password.** Encryption at rest defends the database; it does not
  defend the server.
- Node has no memory hygiene here. Plaintext exists as a JavaScript
  string during a reveal, strings are immutable and garbage-collected
  rather than zeroed, and copies may persist in the heap until
  collection. A process dump could contain a recently revealed password.
- **Usernames, site URLs, labels and notes are stored in plaintext**
  (§9.9). A database dump reveals *which sites the user has accounts
  on, and under what username* — which is information, even without the
  passwords.
- There is no hardware-backed key, no HSM, no KMS, no envelope
  encryption, no key escrow, no audit log of reveals, no per-record
  access policy.
- There is no rate limiting on the reveal step-up until Phase 7 (§9.7).
- A malicious script running on this origin could keylog the step-up
  password field. §9.6 keeps secrets out of the page; it cannot keep an
  attacker out of an input the user types into.

**This is not a password manager.** 1Password, Bitwarden and the
browser's own manager give you a master password that never leaves the
client, a key derived from it, a hardened local vault, breach checking,
generation, autofill, audited implementations and a recovery story. This
feature has none of that and is not trying to.

**Appropriate for:** one person's own low-stakes third-party logins —
the account you created for Acme's Workday because you had to, where the
realistic worst case is that someone sees your application history and
the recovery path is an email reset. Which is to say: appropriate as a
replacement for the text file, which is what it is actually competing
with.

**Not appropriate for:** anything shared with another person; banking,
brokerage, healthcare, government or tax logins; work credentials
belonging to an employer; anything where compromise is unrecoverable or
where a regulation has an opinion; any multi-user deployment of this
app. The `/credentials` empty state and the create sheet both say a
short version of this on screen — the honest place to tell someone what
a vault is for is before they put something in it, not in a design doc
they will never read.

### 9.11 What each of the above is proven by

| Claim | Proof |
|---|---|
| Round-trip works | `secret-box.test.ts`: seal → open returns the input, including multi-byte UTF-8. |
| Tampering is detected, not silently decoded | Flip one ciphertext byte → `open` throws. Flip one auth-tag byte → throws. Truncate the ciphertext → throws. |
| Another user's row does not open | Seal with `userId` A, open with B → throws (the AAD binding). |
| A different key does not open | Seal, then open under a different key → throws. |
| Nonces are never reused | Seal the same plaintext twice → different nonce **and** different ciphertext. |
| A missing / malformed key fails closed | `credentials-key.test.ts`: unset → throws; not base64 → throws; 31 bytes → throws; equal to `AUTH_SECRET` → throws. Plus a service test that `createCredential` with the key unset writes **no row**. |
| Plaintext never reaches a list | `credential-repository.test.ts`: the keys of a `listByUser` row include none of the three secret columns. Plus the E2E page-content assertion (§12.4). |
| Reveal needs the account password | Service test: wrong password → throws, returns no secret; correct password → returns it. |
| Editing a label does not touch the secret | Service test: `secretCiphertext` and `secretNonce` are byte-identical before and after. |
| Rotation works and loss is visible | Service tests: seal under key A, open with A as previous and B as current; then re-encrypt and assert `keyId` is B's and the nonce changed; then open with neither key available → `CredentialUndecryptableError`. |

## 10. Navigation

Five new destinations take `siteNav` from five entries to ten, which is
where a flat list stops scanning. `src/config/site.ts` gains **one
optional field** and the sidebar renders sections:

```ts
export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  group?: string
}

export const siteNav: NavItem[] = [
  { title: "Dashboard",   href: "/dashboard",    icon: LayoutDashboard },
  { title: "Applications", href: "/applications", icon: Briefcase,  group: "Career" },
  { title: "Resumes",      href: "/resumes",      icon: FileText,   group: "Career" },
  { title: "Companies",    href: "/companies",    icon: Building2,  group: "Career" },
  { title: "Tasks",        href: "/tasks",        icon: CircleCheck, group: "Productivity" },
  { title: "Projects",     href: "/projects",     icon: FolderKanban, group: "Productivity" },
  { title: "QuickDrop",    href: "/quickdrop",    icon: Inbox,      group: "Productivity" },
  { title: "Links",        href: "/links",        icon: Link2,      group: "Productivity" },
  { title: "Credentials",  href: "/credentials",  icon: KeyRound,   group: "Productivity" },
  { title: "Settings",     href: "/settings",     icon: Settings },
]
```

`sidebar-nav.tsx` renders ungrouped items first, then each group in
first-appearance order under a `SidebarGroupLabel`. The list is still
read as data — one more field, not a new structure — and **no
collapsible sections**: ten links do not need accordion state, and
accordion state needs persistence to not be irritating.

`topbar.tsx` keeps working unchanged: it does
`siteNav.find((item) => pathname.startsWith(item.href))`, and the array
is still flat.

**The QuickDrop count.** `(app)/layout.tsx` is already a Server
Component that queries the user; it gains one indexed
`count({ where: { userId } })` on `QuickDropItem` and passes it through
`AppShell` to `SidebarNav` as a single named prop
(`quickDropCount: number`), rendered as a small count beside the
QuickDrop entry and omitted at zero. Not a generic `badges` map — that
is speculative generality for one badge. An inbox you cannot see the
size of is a folder.

## 11. Route protection

`src/proxy.ts` (Next.js 16 renamed middleware to **proxy**; this project
has no `middleware.ts`) gates routes in two places that must be kept in
sync, and Phase 2 learned that updating one half-protects the route
silently. **Both** gain all five paths:

```ts
const PROTECTED_PREFIXES = [
  "/dashboard", "/settings", "/applications", "/companies", "/resumes",
  "/projects", "/tasks", "/links", "/quickdrop", "/credentials",
]
// matcher: … "/projects/:path*", "/tasks/:path*", "/links/:path*",
//             "/quickdrop/:path*", "/credentials/:path*"
```

No new API route handlers are added in this phase, so there is nothing
with Phase 3's `/api/resume-versions` exclusion shape.

Every Server Action independently calls `auth()` and returns
`{ success: false, formError: "Unauthorized." }` without a session,
matching every action in Phases 1–3. No new action gets an exception,
and `revealCredentialAction` least of all.

## 12. Cross-cutting concerns

### 12.1 Validation

Zod 4, and the house rule holds without exception: **`.optional()` must
be the outermost wrapper.** A `.transform()` applied after `.optional()`
hides the optional marker from Zod's key inference and yields a
*required* key typed `T | undefined`, breaking every caller that omits
the field. This has bitten the project twice; the comment at the top of
`company-schemas.ts` explains it and every new schema file carries the
same warning.

**Three shared modules, extracted because this phase adds the fourth and
fifth copies.** This is a targeted cleanup of code this phase builds
directly on, exactly the precedent Phase 2 §11.5 set when it extracted
`ActionResult` — not unrelated refactoring:

- **`src/server/validators/url.ts`** — `httpUrl(message?)` and
  `optionalHttpUrl(message?)`. The protocol refinement currently exists
  verbatim in `company-schemas.ts`, `application-schemas.ts` and
  `resume-schemas.ts`, because `z.string().url()` alone accepts
  `javascript:alert(1)`, which was a real hole in this codebase. Those
  three files are updated to import it. The **required** variant must
  carry the same refinement: a required URL field that accepts
  `javascript:` is the identical hole with fewer question marks. Used by
  `Link.url` (required), `Project.url` and `Credential.siteUrl`
  (optional).
- **`src/server/validators/tags.ts`** — `tagList({ max, maxLength })`,
  extracted from `resume-schemas.ts`'s `skillList` + `dedupeSkills`,
  which already dedupes case-insensitively while keeping the first
  spelling the user typed. `resume-schemas.ts` calls it with
  `{ max: 50, maxLength: 50 }` and keeps its exported constants;
  `link-schemas.ts` calls it with `{ max: 10, maxLength: 30 }`. As
  there, the cap is refined **after** the dedupe transform, so it counts
  what is stored.
- **`src/server/validators/limits.ts`** — `SHORT_TEXT_MAX = 500` and
  `LONG_TEXT_MAX = 2000`. Every new optional free-text field uses one of
  the two and the choice is stated: `Task.notes`, `Project.description`
  and `QuickDropItem.content` take `LONG_TEXT_MAX` (a task note is where
  a drafted follow-up email goes); `Link.description` and
  `Credential.notes` take `SHORT_TEXT_MAX`. This does **not** fix Phase
  2's recorded divergence between `Company.notes` (500) and
  `Application.notes` (2000) — that stays on the debt list — but it stops
  the phase from adding five more arbitrary numbers.

Field rules, stated concretely:

```ts
// task-schemas.ts
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: optionalLongText,                       // .optional() outermost
  status: z.enum(TaskStatus).default("TODO"),
  dueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .transform((value) => new Date(`${value}T00:00:00.000Z`))
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value))
    .optional(),                                 // ← outermost
  projectId: optionalId,
  applicationId: optionalId,
})
```

- `optionalId` is
  `z.string().trim().transform((v) => (v === "" ? undefined : v)).optional()`,
  the same shape `application-schemas.ts` uses for `resumeVersionId`, so
  a select's "None" (`""`) lands as `undefined` and clears through
  `?? null` (§6.3) rather than storing `""`.
- `dueDate` parses the `YYYY-MM-DD` that `<input type="date">` emits,
  explicitly, per §7.5. The empty-string branch is tried **before** the
  transform, the same ordering `optionalSalary` uses in
  `application-schemas.ts` for the same reason.
- `completedAt` appears in **no** schema (§7.1).
- `quickDropSchema` is `{ content: z.string().trim().min(1, "Type or
  paste something").max(LONG_TEXT_MAX) }`. One field, no title, no type.
- `credentialSchema`: `label` 1–200; `siteUrl` `optionalHttpUrl()`;
  `username` optional, max 200; `notes` `optionalShortText`;
  `secret` `z.string().min(1, "Password is required").max(512)` on
  **create**, and `.optional()` (outermost) on **update**, where absent
  means "leave the stored password alone" (§6.3).
- `revealCredentialSchema` is `{ id, password }`, and `password` is
  never trimmed — leading and trailing whitespace can be part of a
  password, and silently trimming it makes a correct password fail.

**`isHttpUrl(value)`** lives in `url.ts` beside the schema helpers and is
what `/quickdrop` and any auto-linkification use to decide whether to
render an anchor: it parses with `new URL` inside a `try`, and returns
true only for `http:`/`https:`. A free-text field rendered as a link
without it is the same `javascript:` hole in a different shirt.

### 12.2 Error handling

Typed error classes thrown by services and mapped to field or form
errors by actions, exactly as in Phases 1–3. No raw error text reaches
the client.

| Error | Mapped to |
|---|---|
| `ProjectNameTakenError` | field error on `name` |
| `ProjectNotFoundError` | `notFound()` on a page; generic not-found in an action |
| `ProjectNotOwnedError` | field error on `projectId`, message "Project not found" — it must not confirm the project exists |
| `TaskNotFoundError` | generic not-found |
| `ApplicationNotOwnedError` | field error on `applicationId`, message "Application not found", same reasoning |
| `LinkNotFoundError` | generic not-found |
| `QuickDropItemNotFoundError` | generic not-found; the inbox refreshes |
| `CredentialLabelTakenError` | field error on `label` |
| `CredentialNotFoundError` | generic not-found |
| `InvalidAccountPasswordError` | field error on `password`: "That password isn't right." — and no information about the credential |
| `CredentialsKeyUnavailableError` | form error: "Credential storage isn't configured. Set CREDENTIALS_KEY." |
| `CredentialUndecryptableError` | the §9.5 row-level message |

Two rules carried forward and one added:

- **Not-found and not-yours produce identical output at every layer**,
  including the three `NotOwned` errors above, whose messages are
  deliberately the not-found wording.
- **No filesystem path, no connection string, no environment value ever
  reaches the client.** Phase 3's rule, unchanged.
- **No error on the credentials path interpolates any input** (§9.8).

### 12.3 Loading states

`loading.tsx` skeletons for `/projects`, `/projects/[id]`, `/tasks`,
`/links`, `/quickdrop` and `/credentials`. Each skeleton carries the
**same layout constraints as its real page** — Phase 2 shipped a board
skeleton that overflowed the viewport because it did not
(`docs/superpowers/ui-followups.md` item 3), and the task list's
grouped-rows skeleton is the one here most likely to repeat the mistake.

Sheet and dialog submit buttons disable and show pending text while
their action runs, matching every form in the app. The reveal dialog's
button reads "Checking…" while argon2 verifies, which is deliberately
not instant.

### 12.4 Testing

**Unit (Vitest, no database):**

- `*-schemas.test.ts` for all five modules, each including the
  **optional-key regression**: an omitted optional field must produce an
  *optional key*, not `undefined` on a required one. That is the Zod-4
  footgun this project has hit twice.
- `url.test.ts` — `javascript:alert(1)`, `data:text/html,…`,
  `file:///etc/passwd` and `vbscript:` all rejected by both `httpUrl`
  and `optionalHttpUrl`; `http:` and `https:` accepted; `""` accepted by
  the optional variant and transformed to `undefined`. Same battery for
  `isHttpUrl`.
- `tags.test.ts` — case-insensitive dedupe keeping the first spelling;
  the cap counted **after** dedupe; blank tags rejected.
- `due-date.test.ts` — `2026-09-14` round-trips to `2026-09-14` under
  `TZ=America/Los_Angeles` **and** `TZ=Asia/Kolkata`; bucketing puts
  yesterday in Overdue and null last.
- `search-params.test.ts` for `/tasks` — including `?status=toString`
  and `?status=constructor` rejected, the exact prototype-chain hole
  Phase 2's debt list records as having become a 500.
- `secret-box.test.ts` and `credentials-key.test.ts` — the full battery
  in §9.11.

**Integration (real dev database, cleaning up their own rows):**

- Repository and service tests for all five models, each including the
  **ownership battery**: seed two users, then assert user B cannot read,
  update or delete user A's project, task, link, QuickDrop item or
  credential, and that every attempt is indistinguishable from
  not-found.
- The **cross-entity guard battery, exercised through the public service
  functions** (§6.2), never through the guards: `createTask` and
  `updateTask` with another user's `projectId` throw and write nothing;
  the same with another user's `applicationId`; `triageQuickDropToTask`
  with another user's `projectId` throws **and leaves the QuickDrop item
  in place**.
- The **clear battery** (§6.3): for every `?? null` field in the table
  there, set it, clear it, re-read, assert `null`.
- The **credential secret battery** in §9.11, including the
  byte-identical assertion after a label-only edit.
- Deletion semantics (§7.4): deleting a project leaves its tasks with
  `projectId: null`; deleting an application leaves its tasks with
  `applicationId: null`; neither deletes a task.
- Triage atomicity: a create that fails inside
  `triageQuickDropToLink` leaves the QuickDrop row present.

**E2E (`e2e/productivity.spec.ts`):**

1. Unauthenticated `/projects`, `/tasks`, `/links`, `/quickdrop` and
   `/credentials` each redirect to `/login?callbackUrl=…`. Five
   assertions, because §11 has two lists that can drift apart.
2. Sign up → capture a line from the topbar QuickDrop button → it
   appears at `/quickdrop` and the sidebar count shows 1.
3. Triage it to a Task → it is in `/tasks` and **gone** from the inbox.
4. Give the task a due date of yesterday → it renders under Overdue with
   the date the user typed, not the day before.
5. Check the task's checkbox → it leaves the default list and appears
   under `?status=DONE`.
6. Create a project, attach the task to it, delete the project,
   confirming the dialog's count → the task still exists, now with no
   project.
7. Create an application, create a task against it → the applications
   table shows a task count linking to the filtered list.
8. Create a Link with `javascript:alert(1)` → field error, **no row
   created**. Then a valid `https:` URL → saved, filterable by tag.
9. Create a credential with a known password → the list renders, and
   `expect(await page.content()).not.toContain(secret)` **passes**. This
   is the assertion that proves §9.6 end to end.
10. Reveal with the wrong account password → field error and no secret
    in the DOM. Reveal with the right one → the secret is shown.
11. Delete the credential → gone.

Playwright's raised timeouts from Phase 1 apply; the remote database
makes every action multi-second, and step 10 additionally pays for
argon2.

**Process lesson, carried from Phase 2 and restated in Phase 3, and
binding here:** run `pnpm lint` in **every** task's verification step,
not only the final one. Phase 2 verified with `tsc` and `build` per task
and lint only at the end, and a real defect introduced in task 13
survived six further tasks.

## 13. Spec self-review notes

- **Placeholder scan:** none remain. Every model, column, enum member,
  cascade rule, index, error class, env var, route, byte length and test
  case above is specified concretely. The numbers chosen by judgement
  rather than derivation state their reasoning inline: the 30-second
  reveal timeout, the 512-character secret cap, the 10-tag link cap, and
  the two text-length constants.
- **The two inferences are marked as inferences.** §4 states what
  QuickDrop and Links are taken to mean, the evidence for each reading,
  the alternatives rejected, and — the part that matters — the cost of
  being wrong, which is one small table and one page each. Nothing else
  in the phase depends on either.
- **Internal consistency:** §7.4's `SetNull` matches §8.1's and §8.3's
  dialog copy and §12.4's deletion tests; §7.5's UTC-midnight storage
  matches §12.1's explicit parse, §8.3's client bucketing and
  `due-date.test.ts`; §9.3's non-nullable secret columns match §9.4's
  "plaintext is unrepresentable"; §9.6's client-level `omit` matches the
  single `findSealedById` re-include and the E2E page-content assertion;
  §6.2's guard table matches §12.2's three `NotOwned` errors and
  §12.4's through-the-service test battery; §5's "no new dependencies"
  matches §9's use of `node:crypto` alone. Checked and consistent.
- **Ambiguity check.** The places a reader could reasonably ask "which
  did you mean" are each resolved explicitly:
  (a) whether a task can belong to a job application — §7.3, yes, with
  the reasoning and the three surfaces it appears on;
  (b) whether deleting a project deletes its tasks — §7.4, no, with the
  one rule and why it differs from Phases 2 and 3's `Restrict`;
  (c) whether a due date is a day or an instant, and whose "today"
  counts — §7.5;
  (d) what happens when `CREDENTIALS_KEY` is absent — §9.4, per path,
  including that the list still renders;
  (e) whether an empty password field on an edit clears the secret —
  §6.3, no, and the test that pins it;
  (f) whether `Project` and `ResumeProject` are related — §7.2, no.
- **Security review.** Credentials has its own full section (§9) with a
  stated threat model (§9.1), a dedicated key and the argument for its
  separateness (§9.2), the record format including nonce discipline
  (§9.3), fail-closed behaviour with no plaintext fallback (§9.4),
  rotation and the honest loss case (§9.5), two structural controls
  keeping plaintext out of list and detail responses (§9.6), a step-up
  authorised reveal so a session is not the vault (§9.7), the
  log/error/URL rules (§9.8), the alternatives (§9.9), and the residual
  risk with an explicit is/is-not-appropriate-for (§9.10) — each claim
  tied to a test in §9.11. Outside credentials, the phase's other
  security surface is URL handling: the `javascript:` hole that was real
  in this codebase is closed once, in one shared module, for required
  and optional URLs alike, and extended to the free-text QuickDrop
  render path (§12.1).
- **Scope check, honestly.** This is the largest phase so far: five
  models, six routes, one vault. It is **one plan with a natural split
  point** — 5a (Projects, Tasks, Links, QuickDrop, the nav restructure,
  the three shared validator modules) and 5b (Credentials). The two
  halves share nothing but the app shell, and 5b is the half that wants
  an undistracted review. Splitting anywhere else would be worse: Tasks
  need Projects to attach to, QuickDrop's triage needs all three of its
  targets to exist, and the nav restructure is what makes room for any
  of them.
- **Known deferrals, recorded not discovered:**
  - **An unlock window for credential reveals** (§9.7) is the decision
    here most likely to be revisited. It needs a signed, `httpOnly`,
    `SameSite=Strict`, short-TTL cookie or a server-side session record,
    and whichever it is must not sign with `AUTH_SECRET` (§9.2).
  - **A user-password-derived key** (§9.9) — the strongest alternative,
    blocked today on the absence of password reset and on
    password-change re-encryption.
  - **Rate limiting the reveal action** (§9.7) → Phase 7, with the other
    Section 35 items.
  - **The user's IANA timezone on `User`** (§7.5), which would let the
    server bucket tasks correctly instead of the client.
  - **A global capture keyboard shortcut** (§8.5) → whichever phase
    builds global search, so the two bindings are chosen together.
  - **A GIN index on `Link.tags`** (§7.1) if tag filtering ever gets
    slow. Additive, changes no code.
  - **`Project` ↔ `ResumeProject` provenance** (§7.2).
  - Phase 2's `notes` length divergence is untouched and remains on the
    debt list; §12.1 stops this phase from adding to it.

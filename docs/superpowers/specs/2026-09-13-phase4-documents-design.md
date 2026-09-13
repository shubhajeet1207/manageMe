# ManageMe — Phase 4: Documents — Design Spec

**Date:** 2026-09-13
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)

## 1. Context

Phase 1 shipped the skeleton, Phase 2 the career core and the
**ownership rule**, Phase 3 the resume system — and, with it, a file
storage layer that was deliberately built to outlive resumes. See
`docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`,
`2026-09-12-phase2-core-career-design.md` and
`2026-09-13-phase3-resume-system-design.md`.

Phase 1 §1 describes this phase as "Documents — vault, uploads, preview,
tags, search."

### 1.1 What "vault" means here — an interpretation, stated as one

**The word "vault" appears nowhere else in this repository.** It comes
from the master product prompt referenced by the Phase 1 spec, which was
not available when Phase 2, Phase 3, or this document were written.
Phase 2 §1 records the same gap and resolved it the same way: derive the
requirement explicitly and write the derivation down rather than leave it
implicit.

So this document interprets the vault as:

> **A private store for the documents a career produces** — offer
> letters, payslips, certificates, ID proofs, NDAs and contracts — held
> so the owner can find one later, look at it without downloading it,
> and be sure nobody else can reach it.

That reading rests on three things, not on a guess:

1. **The phase list.** Phase 1 §1 names the modules of the end-state
   product: "job applications, resumes, documents, projects, tasks,
   links, credentials, analytics". Documents sits beside resumes in a
   career-management product; the documents a career produces is the
   only reading consistent with its neighbours.
2. **Credentials is a different module, in a different phase.** Phase 1
   §1 puts Credentials in Phase 5. **The vault is therefore NOT a
   password manager.** Secrets, logins, API keys and recovery codes are
   Phase 5's problem and need a threat model this document does not
   build (encryption at rest, a key derived from the user's password,
   clipboard handling, reveal-on-demand). Nothing here is designed to
   hold a secret, and §8.10 says so in the terms that matter.
3. **The phase's own four words.** "Uploads, preview, tags, search"
   describe a file store with flat classification and retrieval — not a
   credential store, not a note-taking tool, and not a document editor.

**If the master prompt later says otherwise, this section is the thing
to re-read first.** Everything downstream — the model, the allow-list,
the serving route — follows from this paragraph, and a different reading
of "vault" would change all three.

### 1.2 The decisive advantage: the upload stack already exists

Phase 3 §5.2 committed to this in writing:

> This also answers a question Phase 2 left open: **Phase 4's document
> vault reuses this same abstraction.** It is not a resume-specific
> helper, which is why it lives at `src/server/storage/` and not under a
> resume folder, and why the interface talks about keys and bytes rather
> than resumes.

That promise was kept in code. `src/server/storage/storage.ts` is a
four-method driver interface (`put`/`get`/`remove`/`url`) that mentions
neither resumes nor PDFs. `src/server/storage/local-driver.ts`
implements it against a gitignored directory outside `public/`, with
`resolveStorageKey`'s three independent path-traversal gates.
`src/server/files/pdf.ts` does magic-byte validation with no framework
import. `src/server/files/content-disposition.ts` builds a header that
survives a filename containing CRLF.

**This phase reuses all of it and builds no second upload stack.** §5.2
lists, file by file, what is reused untouched and what must be
generalised — and the honest answer to the one real gap is that Phase 3
accepts exactly one content type through a hardcoded five-byte check,
while a vault needs several. That check becomes a **content-type
registry** (§8.3), and `pdf.ts` becomes a thin wrapper over it so
Phase 3's call sites and tests do not move.

This document covers **Phase 4 only**.

## 2. Goals

- A signed-in user can upload a career document, give it a title, tags
  and an optional expiry date, and find it again later.
- Documents are **private to their owner**. There is no URL that serves
  a document to someone who guesses it, no static path to the bytes, and
  no endpoint anywhere that accepts a storage key from a client.
- The vault accepts **more than PDFs** — a photo of a certificate and a
  scan of an ID are the normal case — and every accepted type is decided
  by its bytes, never by what the browser claimed.
- Every accepted type can be **previewed in the browser** without a new
  rendering dependency and without a conversion service.
- **Tags**, not folders. A document is legitimately "offer letter" *and*
  "Google" *and* "2026"; a tree forces a choice between them.
- **Search** over a document's metadata, executed server-side, with the
  query in the URL so a result set can be linked and survives a refresh.
- A document can optionally name the **company** it came from, reusing
  Phase 2's `Company` — with the cross-entity ownership guard that
  relation requires (§5.1b).
- No new npm dependency, no second storage abstraction, no second
  validation path, no second serving route shape.

## 3. Explicit non-goals (deferred)

Scope containment is the point of this list. Each entry says what it is
and why it is not here.

- **OCR and text extraction.** We store bytes and validate that they
  start the way the declared type says they should; we never read what
  is inside. Phase 3 §3 refused a PDF parser as attack surface and this
  phase adds raster images, where extraction means a second, larger
  dependency. **Search therefore matches metadata only** — and §7 puts
  that in the UI microcopy, because a search box that silently does not
  search contents is a search box that lies.
- **AI extraction, classification, summarisation or auto-tagging.** Not
  this phase, and not implied by anything above. Auto-tagging in
  particular would need the extraction ruled out on the line above.
- **Sharing links, public URLs, expiring links, "send to recruiter".**
  There is deliberately no way to make a document readable by anyone but
  its owner. This is the single most load-bearing non-goal in the
  document — it is what §8.6's residual-risk paragraph leans on — and it
  is a stronger commitment here than in Phase 3, because this phase
  stores ID proofs.
- **Versioning.** Uploading a document creates a document. There is no
  version history, no "replace the file", and no revision list.
  **Versioning is the resume system's job** and it is built there
  already (Phase 3 §6): a resume iterates, which is why a slot holds an
  ordered history; an offer letter does not. Correcting a mis-upload is
  delete-and-upload, which is two clicks and needs no schema.
- **Folder hierarchy.** Tags instead, for the reason in §2 and the
  reasoning in §9.2. No `parentId`, no path column, no tree UI, no
  move-between-folders.
- **Thumbnails, image resizing, or any server-side image processing.**
  That is `sharp` or an equivalent — a native dependency with its own
  CVE feed — to produce grid tiles this phase's table does not use (§7).
- **Expiry reminders, notifications, or email.** `expiresOn` drives a
  badge computed at render time and nothing else. Notifications need
  scheduling and delivery infrastructure that does not exist in this
  codebase.
- **Non-allow-listed types** — DOCX and the rest of Office, SVG, HTML,
  plain text, CSV, HEIC, ZIP and every archive. §8.1 and §8.2 give the
  reasoning per family; it is a security decision, not an oversight.
- **Multi-file upload, drag-and-drop zones, and upload progress bars.**
  One file per submit, and a pending button rather than a fake bar —
  identical to Phase 3 §3 and for identical reasons.
- **Bulk actions, "download all as zip", CSV export.** A zip means a
  dependency and a memory profile; bulk selection means a selection
  model the tables do not have.
- **Client-side or at-rest encryption.** See §8.10. "Vault" names a
  privacy property (access control), not a cryptographic one, and
  pretending otherwise in a UI would be the worst kind of security
  theatre. Encryption at rest is a deployment property — Phase 7.
- **Storage garbage collection, per-user quotas and rate limiting.**
  Phase 7, exactly where Phase 3 §8.5 put the same three items. The
  sweep job gains one prefix (`documents/`) and no new design.
- **Dashboard widgets** for any of this — still Phase 6.
- **QuickDrop** (Phase 1 §1's Phase 5 item) is not this. A vault entry
  is a deliberate, titled, tagged filing action.

## 4. Tech additions

**No new npm dependencies.** Again a result rather than an accident, and
this time the reasons are shorter because Phase 3 already paid for most
of them:

| Concern | Choice | Why not a dependency |
|---|---|---|
| Multipart upload | `FormData` / `File` in a Server Action | Unchanged from Phase 3 §4. |
| Object storage | The existing `StorageDriver` + local driver | It was built generic. Using it is the whole point. |
| File type checking | The registry in §8.3, which we write | `file-type` pulls in detectors for 400 formats to answer a closed four-way question. |
| PDF preview | The existing `PdfPreview` (`<object>`) | Already built, already has a real mobile fallback. |
| Image preview | A plain `<img>` (§8.9) | `next/image` is actively wrong here — see §8.9. |
| Full-text search | Postgres `ILIKE` via Prisma `contains` (§9.1) | A `tsvector` column needs raw SQL Prisma cannot express, to serve hundreds of rows. |
| Tag storage | `String[]` on the row (§9.2) | A join table for attribute-less tags, one model after `Resume.skills` chose an array. |
| Ids | `node:crypto` `randomUUID()` | Built in, and already the key scheme. |

New shadcn/Base UI/Radix primitives to generate: **none**. `table`,
`select`, `sheet`, `alert-dialog`, `badge`, `card`, `input`, `label`,
`textarea` and `skeleton` all exist.

**No new configuration.** `next.config.ts` already carries both body-size
limits at `12mb`, `.env.example` already documents `STORAGE_DRIVER` and
`UPLOADS_DIR`, and `.gitignore` already excludes `/.uploads/`. §8.5
explains why **raising** any limit is a two-file change and adds a test
that fails if someone raises one without the other.

## 5. Architecture

Unchanged through four phases:

```
UI → Server Action → Service → Repository → Prisma → PostgreSQL
                        ↘
                         StorageDriver → local disk (.uploads/) | cloud (Phase 7)
```

Storage sits beside the repository layer, not beneath it. A service that
saves a document writes bytes through the driver **and** rows through the
repository, and owns the ordering between them (§8.7). Repositories stay
Prisma queries and nothing else.

### 5.1 The ownership rule, as it applies here

Phase 2 §5.1, restated unchanged for the third time and still not
optional:

> **Every repository function that touches a user-owned row takes
> `userId` as its first parameter and includes it in the `where` clause.
> There is no repository function that can read or write a row without
> being told whose row it is.**

Reads are `findFirst({ where: { id, userId } })`, never
`findUnique({ where: { id } })`. Writes are `updateMany`/`deleteMany`
scoped by `{ id, userId }`, branching on `count`. A missing row and
another user's row are indistinguishable to the client. The shape to
copy is `src/server/repositories/company-repository.ts`.

Four consequences specific to Phase 4:

**(a) `Document` carries `userId` directly.** It has no parent entity to
reach one through, so there is nothing to denormalise — but the column is
still what keeps every `where` mechanical, and the `companyId` relation
below must never become the path ownership is derived from.

**(b) `companyId` is a client-supplied foreign id and needs a guard that
is CALLED.** This is the class of hole that has come up three times in
this codebase: `assertCompanyOwned` (application-service),
`assertResumeVersionOwned` and `assertResumeOwned` (resume-service). The
mechanism is always the same and always worth restating —

> The row being written is the caller's own, carrying the caller's own
> `userId`, so **every `where: { userId }` clause on the write still
> matches**. Repository scoping cannot see the problem. The foreign id in
> the payload is arbitrary client input and nothing but an explicit
> lookup will refuse it.

Without the guard, a user could file a document against another user's
company and have the vault render that company's name — a cross-tenant
read of exactly one string, which is one string too many.

The guard already exists. `assertCompanyOwned` is currently a private
function in `src/server/services/application-service.ts`; this phase
**moves it, with `CompanyNotOwnedError`, into `company-service.ts` and
exports both**, then has `application-service.ts` import them and
re-export `CompanyNotOwnedError` so `applications/actions.ts` and the
existing tests are untouched. Two services calling one guard beats two
copies drifting apart. Precedent: Phase 2 §11.5 extracted `ActionResult`
for the same reason, at the same kind of moment.

It must run on **create and update**, whenever `companyId` is present,
and be skipped when it is `undefined` — unlinking is always allowed.

**And the guard must have a call site.** This codebase has shipped a
guard with a passing unit test and no caller. So §12.4 requires the test
to go through `createDocument`/`updateDocumentMetadata` with a foreign
`companyId` and assert the refusal. **A test of the guard in isolation is
not evidence that anything calls it.**

**(c) The search `where` clause must keep `userId` at the top level.**
§9.1's filter builds an `OR` array over title, description and filename.
`{ userId, OR: [...] }` reads as *userId AND (a OR b OR c)*, which is
correct — but the day someone moves `userId` inside that array to "tidy
it up", the tenancy boundary disappears and every test still passes,
because a single-user test never notices. §12.4 requires the specific
regression test: **user B searches for a term that matches only user A's
document and gets nothing.**

**(d) Authorisation is never derived from a storage key.** Keys contain a
`userId` segment (§8.4) for the same reason as Phase 3 — a readable tree
and a trivial future cloud prefix. That is organisation, not a control.
The control is the database row, checked before a byte is read.

### 5.2 What is reused, and what must be generalised

This is the section a reader should be able to check against the
filesystem. Everything named here exists today.

**Reused verbatim — not copied, not forked, not touched:**

| File | Used for |
|---|---|
| `src/server/storage/storage.ts` | The `StorageDriver` interface and `UnsafeStorageKeyError`. Its doc comment already names this phase. |
| `src/server/storage/local-driver.ts` | `put`/`get`/`remove`, `resolveStorageKey`'s three traversal gates, `0o700`/`0o600` modes. §8.4 shows the new key shape passing `SAFE_KEY` unchanged. |
| `src/server/storage/index.ts` | `getStorage()`, the `STORAGE_DRIVER` switch, the throw-on-unknown. |
| `src/components/pdf-preview.tsx` | The PDF branch of §8.9, including `PREVIEW_BOX` so both previews occupy the same box. |
| `src/components/page-header.tsx`, `empty-state.tsx` | Every page in this phase. |
| `src/types/action-result.ts` | Every action in this phase. |
| `next.config.ts` | Both body limits, already at `12mb` above the 10MB cap. |
| `.gitignore`, `.env.example` | `/.uploads/`, `STORAGE_DRIVER`, `UPLOADS_DIR`. |

**Generalised — seven changes, each behaviour-preserving for Phase 3:**

1. **`src/server/files/pdf.ts` → `src/server/files/content-types.ts`.**
   The five-byte `%PDF-` check becomes a registry of content types, each
   with its signature(s), its server-chosen extension and its preview
   mode (§8.3). `validateUpload(bytes, declaredType, declaredSize, allowed)`
   replaces `validatePdfUpload`'s body.
   **`pdf.ts` stays**, re-exporting `PDF_CONTENT_TYPE`,
   `MAX_UPLOAD_BYTES` and a `validatePdfUpload` implemented as
   `validateUpload(..., [PDF])` — so `resume-service.ts`,
   `upload-version-sheet.tsx`, the resume route and `pdf.test.ts` change
   not one character. The resume path stays PDF-only; **widening the
   vault's allow-list must not widen the resume upload's.** §12.4 keeps
   `pdf.test.ts` as-is precisely as the proof of that.
2. **`MAX_UPLOAD_BYTES` moves to `content-types.ts`**, re-exported from
   `pdf.ts`. One cap for the whole application (§8.5).
3. **`content-disposition.ts` loses its hardcoded fallback.**
   `const FALLBACK = "resume.pdf"` becomes a third parameter,
   `fallback = "download"`. The resume route passes `"resume.pdf"`
   explicitly, so its output is byte-identical; the document route passes
   `document<ext>` from the registry. The existing test gains a case for
   the default and the explicit fallback.
4. **New `src/server/files/file-response.ts`.** The §8.6 header set —
   literal `Content-Type`, `nosniff`, CSP, CORP, disposition,
   `Cache-Control`, `Accept-Ranges`, `Content-Length` — is built in one
   function used by **both** routes. Today the resume route inlines those
   headers; the day a header needs adding, one file should change, not
   two. The resume route is refactored onto it with no behaviour change,
   which §12.4 pins with a header assertion in `resumes.spec.ts`.
5. **New `src/server/files/file-errors.ts`** holding `FileTooLargeError`
   and `StorageError`, re-exported from `resume-service.ts` so every
   existing import site is unchanged. Importing them *from* the resume
   service into the document service would be a dependency pointing the
   wrong way. `FileTooLargeError`'s message stops hardcoding "10MB" and
   derives it from `MAX_UPLOAD_BYTES`.
6. **`assertCompanyOwned` + `CompanyNotOwnedError` move to
   `company-service.ts`** and are exported (§5.1b).
7. **`dedupeSkills` in `resume-schemas.ts` → `src/server/validators/tags.ts`**
   as `dedupeTags`, plus the shared `tagList(maxTags, maxLength)` schema
   builder. `resume-schemas.ts` imports it and keeps `MAX_RESUME_SKILLS`
   / `MAX_SKILL_LENGTH` exactly as they are. Case-insensitive dedupe that
   keeps the first spelling typed is a rule, and one copy of a rule is
   the right number.
   Likewise `resumes/skill-chip.tsx` → `src/components/tag-chip.tsx`,
   imported by the resume files it already serves.

**Deliberately NOT shared: the skills editor's behaviour.**
`resumes/[id]/skills-editor.tsx` is an autosaving, queue-serialising,
optimistic single-field section. Document tags are a field inside a form
that is submitted once. This phase writes a plain controlled
`TagInput` (§7) and leaves the skills editor alone. **Shared chip
styling, not shared behaviour** — rebuilding the skills editor around a
form-field contract is unrelated work with a real regression risk.

### 5.3 Folder structure (additions only)

```
src/
  app/(app)/
    documents/
      page.tsx                      # vault: toolbar + table
      loading.tsx
      actions.ts
      search-params.ts              # q / tag parsing + documentsHref
      search-params.test.ts
      document-table.tsx
      document-toolbar.tsx          # search form + tag chips (client)
      document-sheet.tsx            # upload (create) / metadata (edit) (client)
      delete-document-dialog.tsx
      format.ts                     # re-exports resumes/format.ts helpers
      [id]/
        page.tsx                    # preview + metadata
        loading.tsx
        not-found.tsx
  app/api/
    documents/[id]/file/route.ts    # the only way document bytes leave (§8.6)
  components/
    document-preview.tsx            # dispatches on the registry's previewMode
    image-preview.tsx               # plain <img>, never next/image (§8.9)
    tag-chip.tsx                    # moved from app/(app)/resumes/skill-chip.tsx
    tag-input.tsx                   # controlled string[] field
  server/
    files/
      content-types.ts              # THE REGISTRY (§8.3)
      content-types.test.ts
      file-response.ts              # the §8.6 header set, used by both routes
      file-response.test.ts
      file-errors.ts
      pdf.ts                        # now a thin wrapper; behaviour unchanged
      content-disposition.ts        # fallback parameterised
    repositories/
      document-repository.ts
      document-repository.test.ts
      like-pattern.ts               # LIKE metacharacter escaping (§9.1)
      like-pattern.test.ts
    services/
      document-service.ts
      document-service.test.ts
    validators/
      document-schemas.ts
      document-schemas.test.ts
      tags.ts                       # dedupeTags + tagList, shared with resumes
      tags.test.ts
e2e/
  documents.spec.ts
  fixtures/offer-letter.pdf
  fixtures/certificate.png
  fixtures/not-an-image.png         # HTML named .png — proves §8.3
  fixtures/diagram.svg              # a real SVG — proves §8.2's refusal
next.config.test.ts                 # the §8.5 limits guard
```

Modified: `src/config/site.ts`, `src/proxy.ts`,
`src/server/services/company-service.ts`,
`src/server/services/application-service.ts`,
`src/server/services/resume-service.ts`,
`src/server/validators/resume-schemas.ts`,
`src/app/api/resume-versions/[id]/file/route.ts`,
`src/app/(app)/companies/[id]/page.tsx`, and the resume files importing
`skill-chip`.

## 6. Database schema

```prisma
model Document {
  id               String   @id @default(cuid())
  userId           String
  title            String
  description      String?
  /// Short free-text tags with no attributes of their own, so a Postgres
  /// array rather than a join table — the same shape and the same reasoning
  /// as Resume.skills (§9.2). Defaulted so the column reads as an empty list.
  tags             String[] @default([])
  /// Optional: an ID proof or a certificate that stops being valid. Drives a
  /// badge computed at render time and nothing else — there are no reminders.
  expiresOn        DateTime?
  /// Which company this came from, when it came from one. Client-supplied and
  /// guarded by assertCompanyOwned (§5.1b), never by repository scoping.
  companyId        String?
  /// Display metadata only. It is NEVER part of a storage key (§8.4).
  originalFilename String
  /// Stored, not derived: the row is the record of where the bytes are.
  /// Unique so two rows can never claim the same object.
  storageKey       String   @unique
  /// Validated against the registry at write time, and looked up in the
  /// registry — never echoed — when serving (§8.6).
  contentType      String
  sizeBytes        Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([userId, companyId])
  @@index([tags(ops: ArrayOps)], type: Gin)
}
```

`User` gains `documents Document[]`; `Company` gains
`documents Document[]`.

Migration name: `add_document`. Additive throughout — one new table, two
back-relations, no change to any existing row and no backfill.

**Decisions embedded above, and why:**

- **One row, one file. No slot, no versions.** Phase 3's slot/version
  split exists because a resume iterates and the question worth answering
  is "which file did I send in March". An offer letter is issued once. A
  second upload is a second document, and correcting a mis-upload is
  delete-then-upload. Versioning stays the resume system's job (§3).
- **`onDelete: SetNull` on `Document.company`**, *not* `Restrict`.
  This is a deliberate divergence from `Application.company` and
  `Application.resumeVersion`, and it needs its reason stated because
  consistency would otherwise be the default: the `Restrict` in Phase 2
  protects a record whose **meaning depends on the company** — an
  application to nobody is not an application. A document is a complete
  artifact on its own; the company is an optional label on it. Deleting
  a company should not refuse, and must not destroy a payslip. `SetNull`
  is the only behaviour that loses nothing, and it also means Phase 2's
  "this company has N applications" refusal keeps its current wording
  rather than growing a second clause.
- **No `DocumentKind` enum**, and this was the closest call in the
  document. A closed enum would have given a badge and a filter for free.
  Rejected on three counts: (a) a personal vault's type list is genuinely
  open — the five types §1.1 started from did not include visa documents,
  reference letters, background checks or equity grants, and each of
  those is a migration; (b) with both a kind and tags, every document has
  two overlapping classifications and the user must decide which one
  "payslip" is, a UI question with no good answer; (c) Phase 2's
  `ApplicationStatus` is closed for a reason that does not apply here —
  it is a pipeline with fixed semantics the analytics depend on, and
  nothing in this phase depends on a fixed list. Tags carry
  classification, and §7 seeds suggested tags so an empty vault is not a
  blank text box.
- **No `issuedOn`.** Considered and cut: nothing sorts or filters by it,
  and in practice the date on a document is part of its title ("March
  2026 payslip"). A field that only ever renders next to a title that
  already says the same thing is not pulling its weight. One additive
  nullable column if that changes.
- **`expiresOn` kept**, and it beats a tag like `expires-2027` because a
  date supports a computed state — "Expired", "Expires in 23 days" —
  without the owner maintaining anything. No index: nothing queries by
  it (the badge is computed on rows already loaded), and an index that
  serves no query is cost without benefit.
- **`@@index([userId, createdAt])`** serves the only ordering the vault
  has (§7: newest first).
- **`@@index([userId, companyId])`** serves the company detail page's
  document list, matching `Application`'s equivalent index.
- **`@@index([tags(ops: ArrayOps)], type: Gin)`** makes `hasEvery`
  indexable. Note the asymmetry with `Resume.skills`, which has no such
  index, and it is deliberate: resumes are a handful of slots, while a
  vault grows monotonically — twelve payslips a year — and is the one
  model in this application with an unbounded row count. **Stated
  honestly: at a few hundred rows the planner will very likely sequential-
  scan anyway and the index will do nothing.** It is there so that tag
  filtering does not have to be rewritten when it stops being true.
- **`storageKey @unique`, `contentType`, `sizeBytes`,
  `originalFilename`** — identical to `ResumeVersion` and for identical
  reasons (Phase 3 §6). `contentType` is now genuinely polymorphic, which
  is what that column was put there for: Phase 3 §6 says in as many words
  that it "exists for Phase 4's vault, which reuses this storage layer
  with several types."
- **No `Document.resumeVersionId` or any resume relation.** A resume is
  not a vault document. Keeping the two stores separate is what lets the
  vault accept images while resume upload stays PDF-only.

## 7. Pages & flows

### The vault (`/documents`)

A **table**, matching `/companies` and `/resumes` rather than a card
grid. The thing that would justify a grid is a thumbnail per document,
and thumbnails need server-side image processing this phase refuses
(§3) — plus a PDF, which is most of a career vault, has no thumbnail at
all without the renderer Phase 3 declined. Phase 3 §7 put it exactly
right: *a grid of identical file icons is a grid pretending to be a
gallery.*

Columns: **Title** (with the filename beneath in muted text), **Tags**
(chips, overflowing to "+3"), **Company**, **Type** (a lozenge from the
registry's label — "PDF", "PNG"), **Size**, **Added**. An `expiresOn` in
the past or within 30 days renders a badge beside the title. The row
links to the detail page.

**Toolbar**, above the table:

- A **search input** in a `<form method="get" action="/documents">`,
  submitting on Enter, with hidden inputs carrying the active tags.
  **No debounced per-keystroke navigation**: each keystroke would
  re-render a Server Component page and round-trip the database, and the
  round trip is the slow part at this volume. Enter is a decision; a
  debounce is a guess about when the user finished typing.
- **Tag chips** for the user's existing tags with counts, from the §9.3
  facet query. Clicking toggles a tag into `?tag=`; multiple tags narrow
  (§9.2).
- A **Clear** link when any filter is active.

Every control builds its href through `documentsHref({ query, tags })` in
`search-params.ts`, so changing one parameter can never drop the other —
the same construction as `applicationsHref` in
`app/(app)/applications/search-params.ts`.

**Two different empty states, and they must not be the same component:**

- **Nothing in the vault:** a real explanation of what the vault is —
  offer letters, payslips, certificates, ID proofs — with the upload
  button.
- **Filters match nothing:** "No documents match 'contract'." with the
  active filters named and a Clear link. A user with 40 documents and a
  typo must not be told their vault is empty.

**Microcopy that is a requirement, not a nicety.** Beneath the search
input: *"Searches titles, tags and filenames — not what is inside your
files."* §3 rules out OCR, and a search box that silently does not search
contents will otherwise be read as broken the first time someone searches
for a salary figure they know is in a PDF.

### Document detail (`/documents/[id]`)

Three blocks:

1. **Header** — title, tags, company link (when set), expiry badge,
   and the actions: **Open** (new tab, the §8.6 route), **Download**
   (`?download=1`), **Edit**, **Delete**.
2. **Preview** — §8.9, dispatched on the registry's preview mode. A
   type with no preview mode renders the file card and the two buttons,
   not an empty grey box.
3. **Details** — description, original filename, type, size, added date,
   expiry.

A document id that does not exist *or is not yours* renders the same
`not-found.tsx`. Indistinguishable by design (§5.1).

### Upload (create)

A `Sheet` with:

- **File** — `accept` listing the registry's four types. Client-side
  size and type checks are UX only; the server re-checks and reads the
  bytes (§8.3).
- **Title** — required, max 200, pre-filled on the client from the
  chosen filename's stem. The server has no such default and rejects a
  blank title.
- **Tags** — `TagInput`: type, Enter to add, Backspace or the chip's X to
  remove. Below it, **suggested tags** as one-click chips: the user's
  five most-used tags when they have any, and otherwise the seed set
  *offer letter, payslip, certificate, ID proof, contract* — so an empty
  vault's tag field is not a blank text box with no hint what belongs in
  it. The seed set is a client constant, not a table.
- **Company** — optional, the existing `CompanySelect`.
- **Expires on** — optional date.
- **Description** — optional, max 2000.

Submit posts `FormData` to `createDocumentAction`. The button reads
"Uploading…" while pending. **No progress bar** — a Server Action exposes
no upload progress, and a bar that sits at 0 and jumps to 100 is a fake
UI (Phase 3 §12.3).

### Edit

The same `Sheet` **without the file input**, and its description says so:
*"The file itself can't be changed. Delete the document and upload again
to replace it."* Metadata only — title, tags, company, expiry,
description.

### Delete

Behind an `AlertDialog`. Deletion is permanent and takes the stored
object with it (§8.7). Nothing refuses — a document is referenced by
nothing, which is precisely why it needs no `Restrict` anywhere.

### Company detail (`/companies/[id]`) — modified

Gains a **Documents** block below the existing applications table: title,
tags and added date, each linking to the document, plus an empty line
when there are none. This is the payoff for `companyId` being a real
relation rather than a string — "what do I have from Google" is the
question a vault filed by company is for.

## 8. Upload, validation, and serving

This is the security core of the phase, and it is a harder problem than
Phase 3's. Phase 3 accepted one type, checked five bytes, and served a
single hardcoded `Content-Type`. **This phase accepts arbitrary bytes in
several shapes and hands them back to a browser that will try to
interpret them.** Each subsection states a threat and the control that
answers it.

### 8.1 The allow-list

**Four types. Every one of them has a byte signature, and that is not a
coincidence — it is the admission rule.**

| Type | Signature(s), all of which must match | Key extension | Preview |
|---|---|---|---|
| `application/pdf` | `25 50 44 46 2D` (`%PDF-`) at offset 0 | `.pdf` | native viewer |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` at offset 0 | `.png` | `<img>` |
| `image/jpeg` | `FF D8 FF` at offset 0 | `.jpg` | `<img>` |
| `image/webp` | `52 49 46 46` (`RIFF`) at 0 **and** `57 45 42 50` (`WEBP`) at 8 | `.webp` | `<img>` |

JPEG's signature stops at three bytes because the fourth varies across
JFIF, Exif and SPIFF variants; those three are the SOI marker plus the
first byte of the next, and no other allowed type begins with them. WebP
is the reason a registry entry holds a **list** of signatures that must
**all** match: `RIFF` alone is a container shared with WAV and AVI.

> **The admission rule: a type may only enter this list if its bytes
> identify it.** The check that actually decides is the signature check
> (§8.3), so a type it cannot decide has no membership test at all — only
> a client-supplied string, which is not evidence.

That single rule settles a whole family of requests at once, without
needing a separate argument for each: `text/plain`, `text/csv`,
`text/html`, `application/xml` and `image/svg+xml` have no signature — a
text file may begin with anything, including a BOM, whitespace, or the
text of an attack — so none of them is admissible. §8.2 takes SVG and
HTML separately anyway, because they deserve the specific answer.

Four families are refused for reasons of their own:

- **DOCX, XLSX, PPTX and every other OOXML file** are ZIP archives:
  `50 4B 03 04`. That signature is shared with every JAR, APK, EPUB, ODT
  and plain ZIP in existence, so identifying a DOCX means **opening the
  archive and reading `[Content_Types].xml`** — parsing attacker-supplied
  compressed data, which is exactly the attack surface Phase 3 §8.2
  declined to embed for a smaller gain. And even admitted, a DOCX cannot
  be previewed without a conversion service (Phase 3 §3 called this out).
  The upload sheet says: *export it to PDF.*
- **HEIC/HEIF** *is* identifiable (`ftypheic` at offset 4) and is still
  refused: Chrome and Firefox do not render it, so an iPhone user would
  upload a certificate and get a broken image forever. Refusing at the
  door with "convert to JPEG or PDF" is a better outcome than accepting
  something we cannot show.
- **Archives** (ZIP, 7z, tar.gz) hold documents rather than being one,
  and accepting them invites extraction, which is decompression, which is
  a bomb surface.
- **SVG and HTML** — §8.2.

**Adding a type later is a data change**: one entry in the registry, one
`accept` string, one preview mode, one test. It is deliberately not a
code change — and deliberately not a config change either, because an
allow-list that can be widened by an environment variable is an
allow-list an operator can widen by accident.

### 8.2 Why SVG and HTML are refused — and getting the risk order right

The instinct to correct here is "images are safer than PDFs, they are
just pixels". **That instinct is exactly what makes SVG dangerous**, and
"images" is not one category. The honest ordering, most dangerous first:

```
HTML ≈ SVG   ≫   PDF   >   PNG / JPEG / WebP
```

- **HTML and SVG are scripted document formats.** An SVG is XML. It can
  carry `<script>`, `onload=` and other event handlers, `<foreignObject>`
  containing arbitrary HTML, and external references via
  `xlink:href`/`href`. Served from our own origin as `image/svg+xml` and
  **opened in a tab** — which the Open button and the `<object>` preview
  both do — that script runs **with our origin's session**. It can read
  the session cookie's effects by making same-origin requests, call any
  Server Action, and exfiltrate every document in the vault. That is
  stored XSS with full account access, delivered by a file the OS file
  picker files under "Images".
- **`nosniff` does not save us here.** `X-Content-Type-Options: nosniff`
  stops a browser *guessing* a dangerous type for a benign one. If we
  serve `image/svg+xml` or `text/html`, we are not being tricked — we
  declared it ourselves, and the browser is right to obey.
- **Sanitising an SVG means embedding an XML/DOM sanitiser** and tracking
  its bypasses forever. A parser, again — the dependency Phase 3 §8.2
  refused when the prize was smaller.
- **No career document needs to be an SVG.** Offer letters, payslips,
  certificates and ID proofs arrive as PDFs and scans. The cost of
  refusing is zero.

**Decision: SVG is not allowed. Neither is HTML.** If a future phase ever
genuinely needs to display user-supplied SVG, the answer is not to widen
this list — it is to serve it from a **separate origin** with
`Content-Disposition: attachment` and a `sandbox` CSP, so that what runs
cannot run as us.

**Why PDF is still riskier than a raster image**, even though we allow
it: a PDF is a scriptable format and browser viewers execute JavaScript
embedded in one. Phase 3 §8.4 accepted that with a stated mitigation —
the file is only ever served to the person who uploaded it, so attacker
and victim are the same person — and that mitigation is inherited here
unchanged, because sharing is still a non-goal (§3).

**Why raster images are the safest thing in the list**: a PNG, JPEG or
WebP is handed to the browser's *image decoder*, not its HTML parser.
There is no script host. The classic attack — a polyglot file that is a
valid JPEG *and* valid HTML — needs the browser to choose the HTML
interpretation, and it cannot: we serve a literal, server-chosen
`Content-Type` plus `nosniff` (§8.6). Their residual risks are decoder
vulnerabilities and metadata, both in §8.10.

### 8.3 Validation — the bytes decide, the browser does not

**Threat.** A client-declared MIME type is not evidence. `file.type`
comes from the browser and is trivially forged. An attacker uploads an
HTML file declared as `image/png`, and if the declaration is believed
anywhere in the pipeline, the serving route hands markup back to a
browser on our own origin — stored XSS with session access.

**Controls, all four required:**

1. **The declared type must be in the registry.** Cheap, rejects the
   honest mistake with a good message, proves nothing by itself.
2. **The bytes must match that entry's signature(s)** — every signature
   in the entry, at its stated offset. This is the check that decides.
3. **The declared type and the matched signature must agree.** Not just
   "the bytes match *something* in the registry": a file declared
   `image/png` whose bytes are a PDF is rejected rather than silently
   re-typed. Re-typing would mean the row's `contentType` disagrees with
   what the uploader believes, and a metadata disagreement about a file's
   type is how content-type confusion starts.
4. **The client's extension is never trusted and never propagated.** The
   stored key ends in a **registry-chosen** literal (§8.4); the served
   `Content-Type` is a **registry lookup**, never the stored string
   echoed back (§8.6).

`src/server/files/content-types.ts` owns all of it:

```ts
export type PreviewMode = "pdf" | "image" | "none"

export type ContentTypeSpec = {
  contentType: string
  /** The literal appended to a server-generated key. Never the client's. */
  extension: string
  /** Every signature must match. WebP needs two; that is why this is a list. */
  signatures: readonly { offset: number; bytes: readonly number[] }[]
  previewMode: PreviewMode
  /** The lozenge shown in the table. */
  label: string
}

export const DOCUMENT_CONTENT_TYPES: readonly ContentTypeSpec[]
export const RESUME_CONTENT_TYPES: readonly ContentTypeSpec[]   // PDF only

export type UploadRejectionReason =
  | "empty" | "too-large" | "wrong-type" | "signature-mismatch"

export function validateUpload(
  bytes: Uint8Array,
  declaredType: string,
  declaredSize: number,
  allowed: readonly ContentTypeSpec[]
): { ok: true; spec: ContentTypeSpec } | { ok: false; reason: UploadRejectionReason }

export function findContentType(contentType: string): ContentTypeSpec | undefined
```

No Prisma, no `fs`, no framework import — a pure unit-test target, as
`pdf.ts` is today. **`RESUME_CONTENT_TYPES` exists so that widening the
vault cannot widen resume uploads by accident**; `pdf.ts` calls
`validateUpload` with it and its untouched test file is the proof.

We deliberately stop at the signature rather than parsing. Full
validation means embedding a parser per format, and a parser is itself
attack surface — a larger one than the check would close. Nothing on the
server ever renders or interprets these bytes.

### 8.4 Storage keys — path traversal

**Threat.** A key built from user-controlled text (`../../../etc/passwd`,
`..\windows`, an absolute path, a NUL byte, a percent-encoded `..`)
escapes the storage root.

**Control 1 — no user input in a key, by construction:**

```
documents/<userId>/<randomUUID><extension>
```

Every segment is server-generated: `userId` from the session,
`crypto.randomUUID()` for the object, and the extension **from the
registry entry that the bytes matched** — never from the uploaded
filename. The user-supplied filename is stored in
`Document.originalFilename` for display and download and **never** touches
the key. There is no code path in this phase that concatenates client
text into a key.

The `documents/` prefix is distinct from Phase 3's `resumes/` so Phase 7's
sweep can enumerate each independently.

**Control 2 — the driver refuses unsafe keys anyway, unchanged.**
`resolveStorageKey` in `local-driver.ts` is reused exactly as it is, and
the new key shape passes its three gates without loosening one:

- `SAFE_KEY` is `/^[A-Za-z0-9][A-Za-z0-9\/_-]*\.[A-Za-z0-9]+$/`. Our key
  starts with `d`; the cuid `userId` is alphanumeric; a v4 UUID is hex and
  hyphens, both admitted by the middle class; the single dot is the
  extension's, and every registry extension is alphanumeric after it.
  **No registry extension may contain a dot** — `.tar.gz` would fail this
  regex — which is recorded here as a constraint on adding types and
  asserted in `content-types.test.ts`.
- No segment equals `.` or `..`.
- `path.resolve(root, key)` must still start with `root + path.sep`.

Control 1 means Control 2 should never fire. Control 2 exists because the
day someone builds a key out of a filename, the driver should refuse
rather than comply — which is exactly what Phase 3 §8.1 predicted about
this phase reusing the driver with a different key scheme. The prediction
held: **the key scheme changed and the driver did not.**

### 8.5 Size limits — server-side, at both framework layers and both app layers

**Threat.** A 4GB upload fills the disk or exhausts memory. A
client-side `accept` attribute and a JS size check stop neither.

`MAX_UPLOAD_BYTES` stays at **10MB**, one cap for the whole application,
now living in `content-types.ts`. Per-type caps were considered and cut:
a second constant would have to be kept in sync with two framework limits
that are not per-type, and the failure mode of getting that wrong is the
one described below.

**Four layers, outermost first. The outer two are Next's, and Next has
two of them:**

1. **`experimental.proxyClientMaxBodySize: "12mb"`.** This governs the
   proxy's cloned request stream, **upstream of Server Actions entirely**.
   Its default is exactly `10485760` bytes — 10MB — and, unlike every
   other limit here, **it does not reject an oversized request. It stops
   forwarding bytes past the limit and lets the request continue,
   silently truncating the body.** (`DEFAULT_BODY_CLONE_SIZE_LIMIT` /
   `getCloneableBody` in `next/dist/server/body-streams.js`; the
   truncation is a `p1.push(null)`.) **This bit this project for real:** a
   corrupt file on disk, a row in the database pointing at it, and no
   error anywhere. The comment recording it is in `next.config.ts` today
   and must not be deleted.
2. **`experimental.serverActions.bodySizeLimit: "12mb"`.** This governs
   the Server Actions body parser. Its default of 1MB rejects a real scan
   with an opaque framework error before any of our code runs.
3. **The Zod schema** rejects `file.size > MAX_UPLOAD_BYTES` (§12.1).
4. **`validateUpload` re-checks `bytes.byteLength`** after
   `await file.arrayBuffer()` — the only number that is unarguably the
   truth.

Both framework limits are already set, both at `12mb`, deliberately
**above** the 10MB product cap so that a 10.5MB file produces *our*
"This file is larger than 10MB" field error rather than a framework
failure or, worse, a truncated success.

> **The rule, and this phase is where someone will be tempted to break
> it:** `MAX_UPLOAD_BYTES` may not be raised without raising **both**
> `serverActions.bodySizeLimit` and `experimental.proxyClientMaxBodySize`
> **in the same commit**, and both must stay strictly above it. Scanned
> multi-page documents are exactly the pressure that will produce the
> request. Raising one without the other reintroduces the silent
> truncation.

**A comment is not a guard, so this phase adds one.** `next.config.test.ts`
imports the config and `MAX_UPLOAD_BYTES`, parses both `"12mb"` strings to
bytes, and asserts each exceeds the cap. It fails the build the moment
someone raises the cap alone.

No decompression happens on the server, so there is no zip-bomb surface —
but Phase 3's flat "no decompression anywhere" sentence is **no longer
true of the whole system** and must not be copied forward: PNG and WebP
*are* compressed, and a crafted image can decode to an enormous pixel
buffer. Nothing on our server decodes it (§8.10); the only decoder is the
owner's own browser.

### 8.6 Serving — documents are private to their owner

**Threat.** Files reachable by anyone who guesses a URL.

**They must not be, and the design makes it structural:**

- **Nothing under `.uploads/` is statically served.** It is outside
  `public/` and outside the Next.js route tree. There is no static path
  to a document, guessable or not.
- **There is exactly one route that emits document bytes:**
  `GET /api/documents/[id]/file`.
- **That route takes a row id, never a storage key.** No endpoint
  anywhere in the application accepts a storage key from a client.
- **Ids are authorisation-checked, not secret.** Guessing a valid cuid
  gets a 404, not a file.

The handler, in order:

```
1. const session = await auth()             → 404 (not 401) with no session
2. documentService.readDocumentFile(session.user.id, id)
      → repository findFirst({ where: { id, userId } })
      → not found OR not yours → the same 404, no body distinction
3. storage.get(document.storageKey)
      → null (row without object) → the same 404, and log server-side
4. return fileResponse({ ... })
```

Step 1 returns 404 rather than 401 for Phase 3 §8.4's reason, inherited
without change: this URL is loaded inside an `<object>` and an `<img>`,
and a 401 or a redirect to `/login` renders the login page *inside the
preview frame*. It is also why §11 keeps the route out of the proxy
matcher.

**Response headers, built by `file-response.ts` and used by both routes:**

| Header | Value | Why |
|---|---|---|
| `Content-Type` | `findContentType(row.contentType)?.contentType`, falling back to `application/octet-stream` | **A registry lookup, never the stored string echoed back.** The response cannot be typed by whoever uploaded it. |
| `X-Content-Type-Options` | `nosniff` | Stops the browser sniffing the body as HTML whatever it contains. Still the single most important header here. |
| `Content-Security-Policy` | `default-src 'none'; sandbox` | Defence in depth: even if a type ever slipped through, a sandboxed document with no permitted sources cannot run script as us, load a subresource, or navigate. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Another site cannot embed the bytes as an image. Auth.js's `SameSite=Lax` cookie already blocks the cross-site request; this costs nothing and does not depend on that. |
| `Content-Disposition` | `inline` when previewable and not `?download=1`; otherwise `attachment` | Preview vs. Save — and a type the registry no longer knows is **always** `attachment`. |
| `Cache-Control` | `private, no-store` | An ID proof must never sit in a shared cache. |
| `Accept-Ranges` | `none` | At a 10MB ceiling the object is one response; advertising ranges we do not implement makes viewers retry. |
| `Content-Length` | the actual buffer length | Not `sizeBytes` from the row — a mismatch would truncate the response. The column is for display. |

**The unknown-type fallback is the important new line.** Phase 3 could
serve a constant because there was one type. Here, `row.contentType` is a
string in a database that may have been written when the allow-list was
wider. Looking it up and **failing closed** —
`application/octet-stream` + `attachment`, never rendered, always saved —
means removing a type from the registry retroactively defuses every row
that used it. Echoing the stored value would mean the allow-list only ever
protected future uploads.

**`Content-Disposition` is generated, not interpolated**, by the existing
`content-disposition.ts` (now with a per-caller fallback, §5.2). The
filename is user-supplied text going into an HTTP header — a CRLF splits
the response, an unescaped quote breaks the parameter — and that module
already strips control characters, strips path separators, truncates to
255, emits a reduced ASCII fallback and an RFC 5987 `filename*`.

**One deliberate omission, stated so it does not read as forgotten: the
route does not re-validate the stored bytes' signature before serving.**
The bytes were validated at write time and the key is server-generated;
re-checking would only defend against someone who can already write
inside `.uploads/`, and an attacker with write access to the storage root
owns the server anyway. The registry lookup on `contentType` is where
that budget is better spent, because a row's type can go stale while its
bytes cannot.

**The CSP header carries one open question, recorded rather than
assumed.** `sandbox` on a PDF response disables script inside the PDF,
which is precisely what we want — but some browsers have historically
refused to render a sandboxed PDF in their built-in viewer at all.
§12.4's E2E must therefore assert the PDF preview still renders in all
three Playwright engines. **If one refuses, the resolution is to keep
`default-src 'none'` for every type and drop only `sandbox` for
`application/pdf`, keeping the full header for images — not to drop the
header.** That branch is a `previewMode`-keyed value in
`file-response.ts`, not a special case at a call site.

### 8.7 Write ordering and failure

Identical to Phase 3 §8.5, including the direction, because the reasoning
has not changed:

```
1. Validate: auth → Zod → registry signature → size          (§8.3, §8.5)
2. assertCompanyOwned when companyId is present              (§5.1b)
3. key = documents/<userId>/<randomUUID><spec.extension>
4. await storage.put(key, bytes, spec.contentType)
5. await documentRepository.create(userId, { ...metadata, key, ... })
6. on failure of (5): await storage.remove(key)  — best effort, logged
```

**Storage first**, because the inverse failure is worse: a row written
before its bytes points at an object that never arrived, and the preview
404s on a document the vault insists exists. An orphaned object costs
disk; a dangling row costs correctness. Step 6 cleans up the common case;
the uncommon one (the process dying between 4 and 5) leaves an
unreferenced object for Phase 7's sweep.

Note there is **no transaction** here, unlike Phase 3's — Phase 3 needed
one because a version insert and the slot's `currentVersionId` update are
two writes that must agree. A document is one row.

**Deletion is the other order — rows first, then bytes** — matching
`deleteResume` for its reason: a failed object delete leaves an orphan
for Phase 7 to sweep, where the inverse would leave a row whose preview
404s. Storage failures during delete are caught, logged with the key, and
swallowed: the row is already gone and the user's action succeeded.

### 8.8 What the vault is not protected against, by design

**Rate limiting, per-user quotas and storage GC are Phase 7**, exactly
where Phase 1 §3 and Phase 3 §8.5 put them. Until then the exposure is
bounded by credentials auth on a single-user personal tracker: filling
the disk requires being the account holder.

### 8.9 Preview — one component, three branches

`src/components/document-preview.tsx` dispatches on the registry's
`previewMode`:

- **`"pdf"`** → the existing `PdfPreview`, unchanged, `src` set to the
  §8.6 route. It already carries the real mobile fallback (iOS Safari
  does not render PDFs in-page) that a blank rectangle would not.
- **`"image"`** → `ImagePreview`: a plain `<img>` with `object-contain`
  inside `PREVIEW_BOX`, `alt` set to the document title.
  **Not `next/image`**, and the reason is concrete rather than
  stylistic: the image optimizer fetches the URL **server-side, without
  the user's session cookie**, so every request would hit §8.6's
  unauthenticated 404 — the optimizer would need `remotePatterns`, and
  `dangerouslyAllowSVG` sits one line away in that same config block. A
  plain `<img>` loads with the browser's own credentialed request, which
  is the only thing that works here.
- **`"none"`** → the file card: type lozenge, filename, size, and the
  Open/Download buttons. Reachable only for a row whose type has since
  left the registry, and it must exist for exactly that row.

Both preview branches occupy the same `PREVIEW_BOX` so the page does not
reflow between document types, and neither shows a spinner: `<object>`'s
load event is unreliable across browsers and `<img>` draws progressively.
Faking one would be a fake UI.

### 8.10 Residual risks, stated rather than hidden

- **"Vault" means private, not encrypted.** Bytes are written to disk
  with mode `0o600` under a directory with mode `0o700`, readable by the
  server process. There is **no application-level encryption, no
  encryption at rest beyond whatever the disk or the Phase 7 provider
  supplies, and no client-side encryption.** Anyone with filesystem
  access to the deployment can read every document. This is acceptable
  for a personal tracker on a single operator's infrastructure, and it is
  why §1.1 insists the vault is not the credential store: **secrets need
  a threat model this does not have, and Phase 5 must build its own
  rather than reaching for these tables.** The UI never uses the word
  "encrypted".
- **PDF is scriptable and we do not strip it.** Inherited unchanged from
  Phase 3 §8.4: stripping requires the parser §8.3 declines to embed, and
  the mitigation is the threat model — a file is only ever served to the
  user who uploaded it, so attacker and victim are the same person.
  **The moment sharing exists — a non-goal (§3) — this paragraph stops
  being sufficient, and the feature that introduces sharing owns
  re-answering it for every type in the registry.**
- **Image metadata is preserved, EXIF included.** A photographed
  certificate can carry GPS coordinates, a device serial and a
  timestamp. We do not strip it: stripping means decoding and re-encoding
  the image, which is the image-processing dependency §3 refuses, and the
  file is served only back to the person who took the photo. **The same
  future sharing feature owns stripping it** — this is the second entry
  on that feature's bill, and it is written down here so it is not
  discovered there.
- **Image decoder vulnerabilities are out of our control.** We never
  decode on the server; the decoder is the owner's own browser, which is
  the same decoder they expose to every image on the web.
- **Decompression-bomb images** (a small PNG that decodes to an enormous
  pixel buffer) can hang or OOM a renderer. Again, never ours — and again
  the victim is the uploader.
- **No audit log** of who opened what, because there is one "who".
  Phase 6's activity timeline is where that would live.

## 9. Search and tags

### 9.1 Search: `ILIKE`, server-side, in the URL

**Decision: Prisma `contains` with `mode: "insensitive"` — a Postgres
`ILIKE` — over `title`, `description` and `originalFilename`, executed in
the repository, with the query in the URL.**

**Rejected: Postgres full-text search.** A `tsvector` needs a generated
column or a trigger, neither of which Prisma's schema language can
express without `Unsupported` plus raw SQL in the migration; querying it
means dropping out of the type-safe Prisma API into `$queryRaw`; and it
forces a stemming-language decision. It also **does not do what a filter
box appears to do**: `to_tsquery('pay')` does not match "payslip" without
an explicit `:*` prefix operator, and it never matches mid-word at all.
The user typing into that box expects substring matching, which is what
`ILIKE` is.

**Rejected: client-side filtering.** It requires shipping every row —
descriptions included — to the browser to filter, growing without bound,
and it breaks the model every other list page in this application uses:
the page is a Server Component that reads `searchParams` and queries
(Phase 2 §7's `?view=`/`?status=`). One page filtering in the browser
while its neighbours filter in the database is two mental models for one
table.

**Justified against the realistic data volume**, which is the only
honest way to choose here: one person's career vault holds offer letters
(a handful), payslips (twelve a year), certificates, ID proofs and
contracts. That is **tens to a few hundred rows now and perhaps a
thousand after a decade** — of short text, in a single-user database. A
sequential scan over that is sub-millisecond, and it will stay
sub-millisecond for the lifetime of this application as specified. FTS
would be engineering for a volume that is not coming.

**Recorded as a decision to revisit:** if the vault ever passes a few
thousand rows or the list feels slow, the upgrade is a `tsvector`
generated column with a GIN index and a `$queryRaw` — and it changes
**one repository function**, because that is the only place the query
shape exists.

**LIKE metacharacters must be escaped**, and this is a correctness bug
rather than an injection one — Prisma parameterises the value, so there
is no SQL injection here. But Prisma's `contains` does **not** escape
`%` and `_`, which are wildcards: searching for `50%` would match
documents containing "50" followed by anything, and a query of a single
`%` would match everything while appearing to filter. A query of many
`%` characters is also the one input that could make this scan
expensive. So `src/server/repositories/like-pattern.ts` escapes `\`, `%`
and `_` (backslash first, and backslash is PostgreSQL's default LIKE
escape character with `standard_conforming_strings` on), with unit tests
for each. The schema also caps the query at 100 characters.

The filter, with `userId` at the top level where §5.1c requires it:

```ts
const where = {
  userId,
  ...(tags.length > 0 ? { tags: { hasEvery: tags } } : {}),
  ...(query
    ? {
        OR: [
          { title: { contains: escaped, mode: "insensitive" as const } },
          { description: { contains: escaped, mode: "insensitive" as const } },
          { originalFilename: { contains: escaped, mode: "insensitive" as const } },
        ],
      }
    : {}),
}
```

`originalFilename` is included because "the thing I uploaded was called
`Offer_Acme_Final.pdf`" is a real way people remember a document, even
when the title has since been tidied up.

**Tags are deliberately not matched by the search box**, and the reason
is specific to this codebase rather than a preference: substring-matching
*inside* a text array needs
`EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE $1)`, which Prisma's
API cannot express — it would mean `$queryRaw`, and **raw SQL is where
`where: { userId }` stops being mechanical**, which is the one place
§5.1 refuses to go for a user-owned table. The UX gap is closed without
it: when the typed query matches one of the user's existing tags
case-insensitively, the toolbar offers a one-click *"filter by tag
'payslip'"* chip above the results, computed from the already-loaded
facet list (§9.3) with no extra query.

### 9.2 Tags: `String[]`, not a table

**Decision: a Postgres text array on the row, matching `Resume.skills`.**

The consistency argument is the first one and it is close to decisive:
**Phase 3 already made this exact call, one model over**, and its schema
comment states the reasoning — *"Short free-text tags with no attributes
of their own, so a Postgres array rather than a join table."* Choosing a
`Tag` + `DocumentTag` pair here would mean this application has two
mechanisms for one concept, two editors, two dedupe rules, and a
conversation every time a third model wants tags. §5.2 goes the other way
and **extracts the dedupe and the schema builder so both models share
one rule.**

On the merits, independent of consistency:

- **These tags have no attributes.** No colour, no description, no
  ordering, no hierarchy, no per-tag metadata. A join table's entire
  advantage is a place to put attributes there are none of.
- **They are indexable as an array.** `@@index([tags(ops: ArrayOps)], type: Gin)`
  makes `hasEvery` an index lookup. A normalised design would need a
  join and a `GROUP BY … HAVING COUNT(*) = n` to answer the same
  question.
- **The honest counter-argument is rename.** Renaming a tag everywhere is
  a join table's real win: one `UPDATE tags SET name = …`. With an array
  it is a read-modify-write over the rows matching `tags: { has: old }`.
  At one person's volume that is an `updateMany` over a handful of rows,
  and **this phase does not ship rename at all** — tags are added and
  removed per document. If rename ever lands it is one repository
  function, bounded and testable. That is a smaller cost than a second
  tagging mechanism, so the array wins on the merits and not only on
  consistency.

**Rules, shared with resume skills via `validators/tags.ts`:**
trimmed; non-empty; **max 30 characters** each; **max 20 per document**;
deduplicated **case-insensitively, keeping the first spelling typed** —
because a tag list that silently recases what was entered reads as a bug;
and the cap is refined **after** the dedupe transform so it counts what is
stored.

**Multiple selected tags narrow (`hasEvery`, an AND), not widen.** With
one person's tag vocabulary an OR returns nearly everything, and
narrowing is what the chips are for.

**No folders**, restating §3 with its reasoning: a document is genuinely
"offer letter" *and* "Acme" *and* "2026", and a tree forces a choice
between those three and then hides the document from whichever two the
user did not pick. Tags are the shape of the problem.

### 9.3 The tag facet list

One query, folded in memory:

```ts
export async function listTags(userId: string): Promise<{ tag: string; count: number }[]>
```

`findMany({ where: { userId }, select: { tags: true } })`, counted into a
map, sorted by count descending then tag ascending. Not
`$queryRaw … unnest(tags) … GROUP BY`, for §9.1's reason: raw SQL is
where the ownership rule stops being mechanical, and folding a few
hundred short arrays in memory costs nothing.

The same list feeds three things — the toolbar's chips, the upload
sheet's "your most-used tags" suggestions, and §9.1's tag-match chip.

## 10. Navigation

`src/config/site.ts` gains one entry, between Resumes and Companies:

```ts
{ title: "Documents", href: "/documents", icon: Files },
```

That is the whole navigation change; the sidebar reads this list as data,
as Phase 1 designed it. `Files` rather than lucide's `Vault` or
`FolderLock`: a padlock or a bank-vault door claims a cryptographic
property the feature does not have (§8.10), and an icon is a bad place to
make a promise the security section has to walk back.

Still no entries for unbuilt modules.

## 11. Route protection

`src/proxy.ts` gates routes in two places that must be kept in sync —
`PROTECTED_PREFIXES` and `config.matcher` — and Phase 2 learned that
updating only one half-protects the route silently. Both gain
`/documents`:

```ts
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/applications", "/companies", "/resumes", "/documents"]
// matcher: … , "/documents/:path*"
```

**`/api/documents/:path*` is deliberately NOT added to either**, for the
reason Phase 3 §11 established and this phase inherits: the route
authenticates itself and returns 404 (§8.6), while a proxy redirect would
render the login page inside the `<object>` or break the `<img>`. The
handler's own `auth()` call is the control — middleware protects
navigation, handlers and actions protect data.

Every Server Action independently calls `auth()` and returns
`{ success: false, formError: "Unauthorized." }` without a session,
matching every action in Phases 1–3. No new action gets an exception, and
the user id always comes from `session.user.id` — never from the payload.

## 12. Cross-cutting concerns

### 12.1 Validation

`src/server/validators/document-schemas.ts`. Zod 4, and the house rule
holds without exception: **`.optional()` must be the outermost wrapper.**
Applying `.transform()` after `.optional()` hides the optional marker from
key inference and yields a required key. This has bitten the project
twice; `company-schemas.ts` carries the warning and the new file carries
it too.

```ts
const optionalText = z
  .string().trim().max(2000)
  .transform((value) => (value === "" ? undefined : value))
  .optional()                                    // ← outermost

const optionalId = z
  .string().trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()                                    // ← outermost

// The empty-string branch is tried BEFORE coercion, exactly as
// optionalSalary does: z.coerce.date() turns "" into Invalid Date.
const optionalDate = z.coerce
  .date()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))
  .optional()                                    // ← outermost

const documentFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText,
  tags: tagList(MAX_DOCUMENT_TAGS, MAX_TAG_LENGTH),   // shared, §9.2
  companyId: optionalId,
  expiresOn: optionalDate,
}

export const createDocumentSchema = z.object({
  ...documentFields,
  file: z
    .instanceof(File, { message: "Choose a file" })
    .refine((f) => f.size > 0, "Choose a file")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, `This file is larger than ${MAX_UPLOAD_MB}MB`)
    .refine(
      (f) => DOCUMENT_CONTENT_TYPES.some((spec) => spec.contentType === f.type),
      "Upload a PDF, PNG, JPEG or WebP file"
    ),
})

// No `file`: the file is immutable (§7). Accepting one here would be a
// second write path to guard and a version system by the back door.
export const updateDocumentSchema = z.object({ id: z.string().min(1), ...documentFields })

export const documentSearchSchema = z.object({
  query: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(MAX_DOCUMENT_TAGS).default([]),
})
```

`z.instanceof(File)` works on both sides — `File` is a global in the
browser and in Node ≥20 (this project runs Node 22) — so the client
resolver and the Server Action share one schema, as every other form in
the app does.

**The signature check is deliberately not in the schema.** It needs the
bytes. The action runs the schema, reads the bytes, then calls the
service, which calls `validateUpload` and maps a failure to a field error
on `file` — the same division `uploadResumeVersionAction` already uses.

**`expiresOn` has no past/future refinement.** Unlike
`Application.appliedAt`, which cannot be in the future, an expiry can
legitimately be either: a passport that expired last year is exactly the
document someone needs to be reminded about.

**This phase adds no URL field**, so the `http:`/`https:` protocol refine
is not needed here. If one is ever added — a "where this came from" link
— it must use the `optionalUrl` shape from `resume-schemas.ts`:
`z.string().url()` alone accepts `javascript:alert(1)`, which was a real
hole in this codebase and is guarded in three schema files today.

**URL parameter parsing** lives in `documents/search-params.ts` and
follows `applications/search-params.ts`, including the lesson recorded in
`phase2-known-debt.md`: `value in SomeEnum` walks the prototype chain, so
`?kind=toString` passes as a real value. This phase has no enum in the
URL, but it has the array-shaped problem instead — **`searchParams.tag`
is `string | string[] | undefined`** depending on how many times the
parameter appears, and code that assumes one shape breaks on the other.
`parseTags` normalises both, drops blanks, dedupes and caps at 20; it has
its own unit test with a single string, an array, an empty value and 30
repeats.

### 12.2 Error handling

Typed error classes thrown by services and mapped to field or form errors
by actions, exactly as in Phases 1–3:

| Error | Mapped to |
|---|---|
| `DocumentNotFoundError` | `notFound()` on a page; generic not-found in an action |
| `CompanyNotOwnedError` (shared, §5.1b) | field error on `companyId`, message "Company not found" — it must not confirm the company exists |
| `UnsupportedFileTypeError` | field error on `file`: "Upload a PDF, PNG, JPEG or WebP file." |
| `FileTooLargeError` (shared, §5.2) | field error on `file`, size derived from `MAX_UPLOAD_BYTES` |
| `StorageError` (shared, §5.2) | generic form error |

Two rules with teeth, inherited verbatim:

- **No filesystem path ever reaches the client.** A Node `ENOENT` or
  `EACCES` carries an absolute path, which discloses server layout.
  Storage failures are caught in the service, logged server-side with the
  key, and rethrown as `StorageError` whose message is the generic
  "Something went wrong. Please try again."
- **Not-found and not-yours produce identical output at every layer**,
  including the serving route (§8.6) and the company-ownership error
  above.

`revalidatePath("/documents")` and `revalidatePath("/documents/<id>")`
after every successful mutation, plus `router.refresh()` on the client —
both, as every existing action module does.

### 12.3 Loading states

`loading.tsx` skeletons for `/documents` and `/documents/[id]`. The detail
skeleton carries the same `PREVIEW_BOX` constraints as the real page —
Phase 2 shipped a board skeleton that overflowed the viewport because it
did not (`docs/superpowers/ui-followups.md` item 3), and the fix is to
reuse the constant rather than restate the classes.

Sheet submit buttons disable and show pending text. The upload button
reads "Uploading…". **No progress bar** (§3).

Accessibility items 6–10 in `ui-followups.md` are open findings against
existing components and are **not** this phase's to fix — but new markup
must not add to them: every interactive control in this phase gets a
visible `focus-visible` style, and the tag chips' remove buttons get
accessible names ("Remove tag payslip").

### 12.4 Testing

**Unit (Vitest, no database):**

- `content-types.test.ts` — for **each** registry entry: its own bytes
  accepted; another entry's bytes under its declared type rejected as
  `signature-mismatch` (§8.3 control 3); an HTML document declared as
  `image/png` rejected; a truncated file shorter than the signature
  rejected; an empty buffer rejected; `MAX_UPLOAD_BYTES + 1` rejected;
  exactly `MAX_UPLOAD_BYTES` accepted. Plus: **a WebP with a valid `RIFF`
  header but `WAVE` at offset 8 is rejected** (the multi-signature case
  that motivates the list); **`image/svg+xml` and `text/html` are not in
  the registry** (an assertion, so removing them is a deliberate act);
  and **every extension matches `/^\.[A-Za-z0-9]+$/`** (§8.4's `SAFE_KEY`
  constraint).
- `pdf.test.ts` — **unchanged, not one character**, and that is the point:
  it proves the generalisation preserved Phase 3's behaviour. Plus one
  new case: **a PNG is rejected by `validatePdfUpload`**, proving
  widening the vault did not widen resume uploads.
- `file-response.test.ts` — a known type gets its literal `Content-Type`
  and `inline`; `?download=1` gets `attachment`; **an unknown stored type
  gets `application/octet-stream` + `attachment`** (the §8.6 fail-closed
  path); `nosniff`, the CSP, CORP and `Cache-Control` are present on every
  branch; `Content-Length` is the buffer's length, not a passed-in size.
- `content-disposition.test.ts` — existing cases plus the new fallback
  parameter, including a filename that reduces to nothing under each of
  the two fallbacks.
- `like-pattern.test.ts` — `%`, `_`, `\`, a bare `%`, and a string with
  all three; backslash escaped first.
- `tags.test.ts` — case-insensitive dedupe keeping the first spelling;
  the cap counted after dedupe; blank and over-length entries rejected.
- `document-schemas.test.ts` — valid and invalid cases, and specifically
  that an omitted `description` / `companyId` / `expiresOn` produces an
  **optional key**, not `undefined` on a required one. That is the
  regression test for the Zod-4 footgun this project has hit twice. Plus:
  `""` for `companyId` lands as `undefined`, never `""`; `""` for
  `expiresOn` lands as `undefined`, never an Invalid Date.
- `search-params.test.ts` — `parseTags` against a single string, an
  array, `undefined`, `""`, duplicates and 30 entries; `documentsHref`
  round-tripping query and tags together.
- `next.config.test.ts` — both body limits parse above
  `MAX_UPLOAD_BYTES` (§8.5).

**Integration (real dev database, cleaning up their own rows):**

- `document-repository.test.ts` and `document-service.test.ts`, including
  the **ownership battery**: seed two users, then assert user B cannot
  read, update, or delete user A's document, and cannot read its file —
  every attempt indistinguishable from not-found.
- **The cross-entity guard, through its call site**, not in isolation:
  `createDocument(B, { companyId: <A's company> })` throws
  `CompanyNotOwnedError` and **writes no row and no object**; the same
  for `updateDocumentMetadata`. A guard with a passing test and no caller
  has shipped in this codebase before, so **testing
  `assertCompanyOwned` directly does not count** for this item.
- **The `undefined` trap**, one test per optional field: set
  `description`, `companyId` and `expiresOn`, then update with each
  cleared, and assert the column is `null` afterwards. A test that only
  checks the update succeeded would pass against the bug.
- **The §5.1c tenancy regression**: user A owns a document titled
  "Acme offer"; user B searches `?q=Acme` and gets zero rows. This is the
  test that fails if `userId` ever moves inside the `OR`.
- `readDocumentFile(B, <A's document id>)` returns nothing — the
  unit-level proof behind §8.6's 404.
- **The §8.7 rollback**: a failing row insert leaves no object behind;
  a delete removes both row and object.
- **`SetNull` on company delete**: deleting a company with documents
  succeeds, the documents survive, and their `companyId` is `null`. This
  is the divergence from `Application`'s `Restrict` and it needs its own
  proof.

**E2E (`e2e/documents.spec.ts`):**

1. unauthenticated `/documents` redirects to
   `/login?callbackUrl=%2Fdocuments`;
2. sign up → upload `offer-letter.pdf` with a title and two tags → it
   appears in the table with both chips;
3. the detail page renders the **PDF preview** (the §8.6 CSP check —
   asserted in all three Playwright engines);
4. upload `certificate.png` → the detail page renders an **`<img>`
   preview** whose `naturalWidth` is non-zero, which is the only
   assertion that proves the bytes actually decoded;
5. upload `not-an-image.png` (HTML with a `.png` name, declared
   `image/png`) → a field error on the file input and **no new row**.
   This is the test that proves §8.3 end to end;
6. upload `diagram.svg` → refused. **This is the test that proves §8.2's
   decision is enforced and not merely written down**, and it must fail
   loudly if anyone adds SVG to the registry;
7. `GET` the file route directly and assert the headers:
   `content-type` is the literal registry value, `x-content-type-options`
   is `nosniff`, and `content-disposition` matches;
8. search for a word in one document's title → the table narrows; search
   for a word in nothing → the **"no matches" empty state**, not the
   "vault is empty" one;
9. filter by a tag, then by two tags → the second narrows the first;
10. link a document to a company → it appears on the company detail page
    → delete the company → the document survives with no company;
11. delete the document → it is gone from the table.

Playwright's raised timeouts from Phase 1 apply; the remote database
makes every action multi-second.

**Process lesson carried forward from Phase 2 and restated in Phase 3,
binding again here:** run `pnpm lint` in **every** task's verification
step, not only the final one. A real defect introduced in Phase 2's task
13 survived six further tasks because lint ran once at the end.

**Two specific verification steps this phase's plan must include**, both
because it modifies shipped code rather than only adding to it:

- After the §5.2 moves (`assertCompanyOwned`, `FileTooLargeError`,
  `dedupeSkills`, `skill-chip`), the **whole** existing test suite must
  pass untouched. Any existing test that needs editing is evidence the
  move was not behaviour-preserving.
- `pnpm exec prisma migrate dev --name add_document` **followed by
  `pnpm exec prisma generate`** — `migrate dev` does not reliably
  regenerate the client, and `Document` missing from `@prisma/client` is
  a confusing failure to debug.

## 13. Spec self-review notes

- **Placeholder scan:** none remain. Every model, column, cascade rule,
  index, signature, header, error class, route, constant and test case
  above is specified concretely. The numbers chosen by judgement rather
  than derivation — 20 tags, 30 characters a tag, a 100-character query,
  a 30-day expiry warning — are small, stated in one place each, and
  state their reasoning where it is not obvious.
- **Interpretation flagged, not buried.** §1.1 says plainly that "vault"
  is undefined in this repository, gives the three things the reading
  rests on, and names itself as the first thing to re-read if the master
  prompt resurfaces. The strongest consequence — that this is not the
  credential store — is stated there and enforced in §8.10.
- **Reuse is specific and checkable.** §5.2 names eight files reused
  untouched and seven generalisations, each with the reason and each
  behaviour-preserving for Phase 3. The claim that Phase 3 built for this
  is quoted from Phase 3 §5.2 rather than asserted.
- **Internal consistency:** §8.1's admission rule (a type needs a
  signature) matches §8.2's SVG refusal, §8.3's four controls and
  `content-types.test.ts`'s assertion that SVG is absent; §6's
  `SetNull` matches §7's company-detail block, §12.2's absence of an
  in-use refusal and §12.4's cascade test; §3's "no versioning" matches
  §6's single-row model, §7's file-less edit sheet and §12.1's
  `updateDocumentSchema` having no `file`; §9.2's array choice matches
  §6's `String[]`, §5.2's shared `tags.ts` and Phase 3's `Resume.skills`;
  §8.6's registry lookup matches §6 storing `contentType` and §8.9
  dispatching on `previewMode`. Checked and consistent.
- **Ambiguity check:** the five places a reader could reasonably ask
  "which did you mean" are resolved explicitly — (a) whether the vault is
  the password manager (§1.1: no, Phase 5, with the reason);
  (b) whether a document is versioned (§3, §6: no, that is resumes');
  (c) whether tags are an array or a table (§9.2: an array, with the
  rename counter-argument answered rather than ignored); (d) whether
  search is FTS, ILIKE or client-side (§9.1: ILIKE, justified against a
  stated volume with the upgrade path named); (e) whether SVG is allowed
  (§8.2: no, with the risk ordering corrected — raster images are the
  *safest* thing in the list and SVG is the most dangerous, and
  conflating them is the whole trap).
- **Security review:** the named risks each have a control and a test —
  content-type spoofing (§8.3, four controls, tested per registry entry
  and end to end), scripted formats (§8.2, refused at the allow-list,
  with an E2E that fails if the list is widened), path traversal (§8.4,
  two independent controls, the driver reused unchanged and shown to
  pass), server-side size enforcement (§8.5, four layers across two
  framework limits, one shared constant, and a **test** that fails if
  someone raises the cap alone), private serving (§8.6, one authorising
  route, no static path, no key-accepting endpoint, fail-closed on an
  unknown type), and cross-tenant references (§5.1b, a shared guard with
  a test that goes through the call site). Residual risks are stated
  rather than hidden in §8.10: private is not encrypted, PDF is
  scriptable, EXIF is preserved, decoder bugs and decompression bombs are
  the client's, and there is no audit log.
- **The one thing this phase adds that Phase 3 did not have to solve:**
  Phase 3's `Content-Type` was a constant, so a stale row could not
  mistype a response. Here it is a lookup, and the fail-closed default
  (§8.6) is what makes removing a type from the allow-list retroactive
  rather than forward-only. That is the single most important line in the
  serving design, and `file-response.test.ts` covers it directly.
- **Scope check:** one implementation plan's worth. The registry, the
  model, the serving route and the preview are inseparable — the route
  needs the registry to pick a type, the preview needs the registry to
  pick a branch, and the model needs the registry to pick a key
  extension. The §5.2 extractions are targeted cleanups of code this
  phase builds directly on, not unrelated refactoring, and each is
  covered by tests that already exist.
- **Known deferrals, recorded not discovered:**
  - **Tag rename** (§9.2) is the decision here most likely to be
    revisited. When it is, it is one repository function over
    `tags: { has: old }`.
  - **Full-text search** (§9.1) → whenever the vault passes a few
    thousand rows; one repository function changes.
  - **EXIF stripping and per-type sharing risk** (§8.10) → owned by
    whatever feature introduces sharing, which this phase and Phase 3
    both refuse.
  - **Orphaned storage objects, quotas and rate limiting** (§8.8) →
    Phase 7, joining Phase 3's identical list; the sweep gains one
    prefix.
  - **A cloud storage driver** → Phase 7, still one new file and one
    `case` in `getStorage()`. Nothing in this phase moved that goalpost.
  - **Encryption at rest** (§8.10) → Phase 7 / deployment, and a
    prerequisite for Phase 5's Credentials rather than for this.
  - Phase 2's `notes` length divergence and its table-sorting debt are
    untouched and remain on the debt list; this phase's vault
    deliberately has no column sorting for the same reason.

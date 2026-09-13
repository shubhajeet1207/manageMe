# ManageMe — Phase 3: Resume System — Design Spec

**Date:** 2026-09-13
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)

## 1. Context

Phase 1 (Foundation) shipped the skeleton — Next.js, Postgres via Prisma,
Auth.js credentials auth, design system, app shell. Phase 2 (Core Career
System) shipped Companies and Applications, the Kanban board and the
table, and — more importantly for this phase — the **ownership rule**
that every later phase inherits. See
`docs/superpowers/specs/2026-08-24-phase1-foundation-design.md` and
`docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`.

Phase 1 §1 describes this phase as "Resume system — library, versioning,
PDF preview, resume↔application linking, resume analytics". Phase 2 §1
declared it blocked: *"Phase 3 (Resumes) is blocked on an unmade
file-storage decision and is not designed here."* That decision has now
been made (§5.2) and the block is lifted.

This is the first phase in which the application **accepts arbitrary
bytes from a user**. Every phase so far has taken only text through Zod
schemas into Postgres. A file upload is a different class of input: it
is unvalidated content that gets written to a filesystem under a
server-chosen name and later served back over HTTP. §8 treats that with
the attention it deserves rather than as a footnote to the feature.

This document covers **Phase 3 only**.

## 2. Goals

- A signed-in user can create named **resume slots** ("Backend SWE",
  "Data roles"), each holding an ordered history of uploaded PDF
  **versions**, and can nominate which version is current.
- Uploading a file **adds** a version. It never replaces one. Six weeks
  after sending a resume, the user can open the exact bytes that were
  sent.
- A resume version can be previewed in the browser without downloading
  it and without installing a PDF rendering library.
- An application can record **which version was actually sent** —
  nullable, because most historical rows won't have one.
- Per resume, the user can see how many applications used it and how
  those applications currently stand, derived from the existing
  pipeline with no new tracking tables.
- Uploaded files are **private to their owner**. There is no URL that
  serves a file to someone who guesses it, and no path a user can
  supply that escapes the storage root.
- File storage sits behind an interface with a local-disk
  implementation, so choosing a cloud provider in Phase 7 is a config
  change rather than a rework — and so Phase 4's document vault has an
  abstraction to reuse instead of inventing a second one.

## 3. Explicit non-goals (deferred)

- **Resume parsing, OCR, or text extraction.** No reading the contents
  of the PDF. We store bytes and validate that they are a PDF; we do
  not interpret them. A parser is a large dependency and a large piece
  of attack surface, and nothing in this phase needs the text.
- **AI rewriting, tailoring, scoring, or keyword matching.** Not this
  phase, and not implied by any of the above.
- **Cover letters.** A separate document type with its own lifecycle.
  Phase 4's vault is the right home if it turns out to be wanted.
- **Diffing between versions.** Requires text extraction (see above)
  plus a diff UI. The version list with labels and dates answers "which
  one did I send" — which is the actual question.
- **Sharing links / public URLs.** There is deliberately no way to make
  a resume file readable by anyone but its owner. This is the single
  most load-bearing non-goal in the document; §8.4 enforces it.
- **Deleting an individual version.** See §6's decision note. The whole
  resume slot can be deleted; a single version cannot.
- **Version numbers.** Versions have labels and timestamps, not
  ordinals. A stored counter invites gaps, races, and renumbering.
- **Non-PDF uploads** (DOCX, ODT, images). PDF only, §8.2. DOCX would
  need a converter to preview, which is a service, not a library.
- **Upload progress bars.** A Server Action gives the client no upload
  progress events. A bar that jumps 0→100 is fake UI; the button shows
  a pending state instead (§12.3).
- **Multi-file / drag-and-drop upload zones.** One file per submit.
- **Storage garbage collection and per-user quotas.** §8.5 records the
  orphan case and points it at Phase 7 alongside rate limiting.
- **Dashboard widgets** for any of this — still Phase 6.

## 4. Tech additions

**No new npm dependencies.** That is a result, not an accident:

| Concern | Choice | Why not a dependency |
|---|---|---|
| Multipart upload | `FormData` / `File` in a Server Action | Next.js parses the multipart body already; there is no `multer` equivalent to add. |
| PDF preview | The browser's native viewer via `<object>` | `pdf.js` is ~1MB of JS to reimplement what Chrome, Safari and Firefox all do natively and better. |
| File type checking | A 5-byte magic-number check we write | `file-type` pulls in detectors for 400 formats to answer one question about one format. |
| Object storage | Local-disk driver behind our own interface (§5.2) | Picking a cloud provider means account setup before any code can be written. Phase 7 decides deployment. |
| Hashing / ids | `node:crypto` `randomUUID()` | Built in. |

New shadcn/ui primitives to generate: **none**. `table`, `select`,
`sheet`, `alert-dialog`, `badge`, `card`, `input`, `label` all exist.

New config:

- `next.config.ts` gains
  `experimental.serverActions.bodySizeLimit: "12mb"`. The default is
  1MB, which would reject a 4MB resume with a framework error before
  any of our code runs. 12mb is deliberately above the 10MB product
  limit so that **our** validator produces the message (§8.3).
- `.env.example` gains `STORAGE_DRIVER="local"` and
  `UPLOADS_DIR=".uploads"`.
- `.gitignore` gains `/.uploads/`.

## 5. Architecture

Unchanged from Phase 1 and 2:

```
UI → Server Action → Service → Repository → Prisma → PostgreSQL
```

with one addition for bytes, which do not belong in Postgres:

```
Service → StorageDriver → local disk (.uploads/) | cloud (Phase 7)
```

Storage sits beside the repository layer, not beneath it: a service
that saves a resume version writes bytes through the driver **and**
rows through the repository, and owns the ordering between them (§8.5).
Repositories stay what they are — Prisma queries and nothing else.

### 5.1 The ownership rule, as it applies here

Phase 2 §5.1 is restated unchanged and is not optional:

> **Every repository function that touches a user-owned row takes
> `userId` as its first parameter and includes it in the `where` clause.
> There is no repository function that can read or write a row without
> being told whose row it is.**

Reads are `findFirst({ where: { id, userId } })`, never
`findUnique({ where: { id } })`. Writes are `updateMany`/`deleteMany`
scoped by `{ id, userId }`, branching on `count`. A missing row and
another user's row are indistinguishable to the client. See
`src/server/repositories/company-repository.ts` for the shape to copy.

Three consequences specific to Phase 3:

**(a) `ResumeVersion` carries its own `userId` column** even though it
could reach one through `Resume`. `Application` already does this with
`Company`. Denormalising the column is what lets the rule stay
mechanical — `where: { id, userId }` rather than
`where: { id, resume: { userId } }`, which is a relation filter a future
edit can drop without the type system noticing.

**(b) Cross-entity ownership checks live in the service**, exactly as
`assertCompanyOwned` does in
`src/server/services/application-service.ts`. That function exists
because repository scoping cannot catch it: a write to the caller's
*own* application row can still carry someone else's `companyId`, and
every `where: { userId }` clause on the application still matches.
Linking a resume has the identical hole, so `application-service.ts`
gains its twin:

```ts
// Same reasoning as assertCompanyOwned: the application row being
// written is the caller's, so repository scoping passes, but the
// resumeVersionId in the payload is an arbitrary client-supplied id.
// Without this, a user could point their application at another
// user's file and have the UI render a link to it.
async function assertResumeVersionOwned(userId: string, versionId: string) {
  const version = await resumeRepository.findVersionById(userId, versionId)
  if (!version) throw new ResumeVersionNotOwnedError()
}
```

It runs on create and update whenever `resumeVersionId` is present, and
is skipped when it is `undefined` (unlinking is always allowed).
`setCurrentVersion(userId, resumeId, versionId)` needs the same check in
the other direction — the version must belong to *that resume* and to
the caller — and gets it in `resume-service.ts`.

**(c) Authorisation is never derived from a storage key.** Keys contain
a `userId` segment (§8.1) because it makes the directory tree readable
and a future per-user cloud prefix trivial. That is organisation, not a
control. The control is the database row, checked before any byte is
read.

### 5.2 File storage — a driver interface, local disk now

**Decision (settled).** Define a storage interface now and implement it
against the local filesystem. Do not pick a cloud provider in this
phase.

The reasoning: choosing S3, R2, Blob, or GCS today means account setup,
credentials, and a billing decision *before the first line of Phase 3
code can be written*, and Phase 7 is the phase that decides deployment
— which is also what decides which cloud is the right one. Writing to a
gitignored directory costs nothing, runs offline, and keeps the tests
hermetic. A cloud driver later is a new file plus one `case` in a
factory.

This also answers a question Phase 2 left open: **Phase 4's document
vault reuses this same abstraction.** It is not a resume-specific
helper, which is why it lives at `src/server/storage/` and not under a
resume folder, and why the interface talks about keys and bytes rather
than resumes.

`src/server/storage/storage.ts`:

```ts
export interface StorageDriver {
  /** Write bytes at `key`, overwriting any existing object there. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Read bytes at `key`, or null if there is no such object. */
  get(key: string): Promise<Uint8Array | null>
  /** Delete `key`. Idempotent: resolves when the object is already absent. */
  remove(key: string): Promise<void>
  /**
   * A short-lived, driver-signed URL for `key`, or null when the driver
   * cannot sign one. The local driver always returns null — its objects
   * are outside the web root and have no addressable URL by design.
   */
  url(key: string): Promise<string | null>
}
```

Notes that are decisions, not commentary:

- **`get` returns bytes only.** Content type, size, and original
  filename live on the `ResumeVersion` row, which is the single source
  of truth for metadata. Two places that can disagree about a file's
  type is how a content-type confusion bug starts.
- **`put` takes `contentType` anyway**, because a cloud driver must set
  it on the object at write time. The local driver ignores it. Stating
  that plainly beats leaving the next reader to wonder.
- **`url()` is not called anywhere in Phase 3.** Files are always served
  through the authorising route in §8.4. It exists so a Phase 7 cloud
  driver can offer signed URLs as an optimisation, and the route
  handler is the single place that would change:
  `const signed = await storage.url(key); if (signed) redirect(signed)`.
  Returning `null` is the honest local answer — a local file has no URL.
- **`Uint8Array`, not `Buffer`**, so nothing in the interface is
  Node-specific.

`src/server/storage/local-driver.ts` writes under `UPLOADS_DIR`
(default `.uploads`, resolved against `process.cwd()`). That directory
is gitignored and — this matters — is **not** inside `public/` or any
other path Next.js serves statically. Nothing reaches these bytes
except through §8.4.

`src/server/storage/index.ts` exports `getStorage(): StorageDriver`,
switching on `STORAGE_DRIVER` and defaulting to `local`. An unknown
value throws at startup rather than silently falling back — a typo in a
deploy env should fail loudly, not write production resumes to a
container's ephemeral disk.

### 5.3 Folder structure (additions only)

```
src/
  app/(app)/
    resumes/
      page.tsx                      # library table
      loading.tsx
      actions.ts
      resume-table.tsx
      resume-sheet.tsx              # create/edit slot (client)
      delete-resume-dialog.tsx
      upload-version-sheet.tsx      # file + label (client)
      [id]/
        page.tsx                    # preview + versions + usage
        loading.tsx
        not-found.tsx
        version-list.tsx
        set-current-version-button.tsx
        resume-usage.tsx
  app/api/
    resume-versions/[id]/file/route.ts   # the only way bytes leave (§8.4)
  components/
    pdf-preview.tsx                 # <object> + real fallback
    resume-version-select.tsx       # grouped by resume; used by the app form
  server/
    storage/
      storage.ts                    # StorageDriver interface
      local-driver.ts
      local-driver.test.ts
      index.ts                      # getStorage()
    files/
      pdf.ts                        # size + magic-byte validation
      pdf.test.ts
      content-disposition.ts        # header encoding (§8.4)
      content-disposition.test.ts
    repositories/
      resume-repository.ts
      resume-repository.test.ts
    services/
      resume-service.ts
      resume-service.test.ts
    validators/
      resume-schemas.ts
      resume-schemas.test.ts
e2e/
  resumes.spec.ts
  fixtures/sample.pdf               # minimal valid PDF
  fixtures/not-a-pdf.pdf            # HTML named .pdf — proves §8.2
```

`application-schemas.ts`, `application-service.ts`, `application-sheet.tsx`,
`application-table.tsx`, `config/site.ts`, `src/proxy.ts`,
`next.config.ts`, `.env.example` and `.gitignore` are modified.

## 6. Database schema

```prisma
model Resume {
  id               String   @id @default(cuid())
  userId           String
  name             String
  notes            String?
  currentVersionId String?  @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions       ResumeVersion[] @relation("ResumeVersions")
  currentVersion ResumeVersion?  @relation("ResumeCurrentVersion", fields: [currentVersionId], references: [id], onDelete: SetNull)

  @@unique([userId, name])
  @@index([userId])
}

model ResumeVersion {
  id               String   @id @default(cuid())
  userId           String
  resumeId         String
  label            String
  originalFilename String
  storageKey       String   @unique
  contentType      String
  sizeBytes        Int
  createdAt        DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  resume       Resume        @relation("ResumeVersions", fields: [resumeId], references: [id], onDelete: Cascade)
  currentOf    Resume?       @relation("ResumeCurrentVersion")
  applications Application[]

  @@index([userId, resumeId, createdAt])
  @@index([userId])
}
```

`Application` gains **one nullable column and one relation** — precisely
the additive change Phase 2 §12 predicted:

```prisma
model Application {
  // … every existing field unchanged …
  resumeVersionId String?

  resumeVersion ResumeVersion? @relation(fields: [resumeVersionId], references: [id], onDelete: Restrict)

  @@index([userId, resumeVersionId])
}
```

`User` gains the two back-relations (`resumes`, `resumeVersions`).

**Decisions embedded above, and why:**

- **The slot/version split is the whole feature.** `Resume` is a named
  slot with no file of its own; `ResumeVersion` is a file with a label
  and a timestamp. There is no "replace the file on a resume"
  operation anywhere in this spec — uploading always inserts. The point
  is being able to open what was sent six weeks ago, and an overwrite
  destroys exactly that.
- **`Application.resumeVersionId` points at a VERSION, not a resume.**
  "Which file did I actually send" is the question worth answering, and
  a resume-level pointer answers a strictly weaker one. A row pointing
  at the slot would silently change meaning every time a new version was
  uploaded.
- **`onDelete: Restrict` on `Application.resumeVersion`**, matching
  Phase 2's choice for `Application.company` and for the same reason: a
  cascade would silently destroy the record of what was sent, which is
  the kind of loss noticed a month too late. The service checks the
  count first and raises `ResumeInUseError(count)` so the user gets the
  Phase 2-style message (§7) rather than a raw Prisma foreign-key error;
  the database constraint is the backstop, not the messenger.
- **`onDelete: Cascade` from `Resume` to its versions.** Deleting a slot
  that nothing references takes its versions with it, and the service
  removes their objects from storage in the same operation. Because the
  `Restrict` above is checked first, this cascade can only ever fire on
  versions no application references.
- **`currentVersionId` is `SetNull` and `@unique`.** Unique because one
  version is current for at most one resume; `SetNull` so the pointer
  can never dangle. The circular relation means creation is two steps —
  insert the `Resume` with a null pointer, insert the version, then
  point — which §8.5 sequences inside one transaction.
- **No version deletion.** Deferred in §3 and worth the explicit
  reasoning: deleting a single version reopens current-version
  repointing, orphaned application links, and partial storage cleanup —
  three edge cases in exchange for tidying up a mis-upload. A mis-upload
  can be relabelled ("ignore — wrong file"), and the whole slot can be
  deleted. This is the decision in this document most likely to be
  revisited, and it is recorded in §13 as such.
- **`storageKey` is stored, not derived.** Derivation is a rule, and
  rules change — a cloud driver may prefix differently. The row is the
  record of where the bytes are. `@unique` so two rows can never claim
  the same object.
- **`contentType` and `sizeBytes` are stored** because the serving route
  needs metadata without touching the filesystem, and the library table
  shows a size. `contentType` is `"application/pdf"` for every row this
  phase writes — the column exists for Phase 4's vault, which reuses
  this storage layer with several types.
- **`originalFilename` is display metadata and never part of a key.**
  See §8.1.
- **`@@unique([userId, name])` on `Resume`**, matching `Company`: two
  slots called "Backend SWE" would split a resume's history and corrupt
  the §9 numbers.
- **`@@index([userId, resumeId, createdAt])`** serves the version list,
  which is always "this resume's versions, newest first".
- **No `versionNumber`.** §3.

Migration name: `add_resume_and_resume_version`. It is additive
throughout — a new table, a new nullable column, a new index. No
existing row changes and no backfill is needed.

## 7. Pages & flows

### Resume library (`/resumes`)

A **table**, matching `/companies` rather than a card grid. The thing
that would justify a grid is a thumbnail of each resume, and this phase
deliberately has no PDF rendering (§4) — a grid of identical file icons
is a grid pretending to be a gallery.

Columns: **Name**, **Current version** (label + upload date), **Versions**
(count), **Used by** (application count, §9), **Updated**. The row links
to the detail page.

Create/edit the slot in a `Sheet` (name, notes). Delete behind an
`AlertDialog`. Attempting to delete a resume whose versions are
referenced by applications surfaces an inline message naming the count —
"3 applications were sent a version of this resume. Unlink them first."
— exactly the shape of Phase 2's company refusal, not a generic toast.

**Empty state:** a real one explaining what a resume slot is, with a
button that opens the create sheet. Not an empty table with five
headers.

### Resume detail (`/resumes/[id]`)

Four blocks, top to bottom:

1. **Header** — name, notes, "Upload new version" (primary), edit,
   delete.
2. **Preview** — the current version rendered by the browser (§8.6). If
   the slot has no versions yet, an empty state with the upload button,
   not an empty grey box.
3. **Versions** — newest first: label, "Current" badge on one of them,
   original filename, size, upload date, **Open** (new tab, the §8.4
   route) and **Set as current** on the others. Setting a current
   version is a Server Action and a `router.refresh()`.
4. **Used by** — the §9 numbers plus the list of applications linked to
   any version of this slot, each row naming the specific version and
   linking to the application.

A resume id that does not exist *or is not yours* renders the same
`not-found.tsx`. The two cases are indistinguishable by design (§5.1).

### Upload a version

A `Sheet` containing a file input (`accept="application/pdf"`) and a
label field. The label is required, max 100 characters, and is
pre-filled on the client from the chosen filename's stem as a
convenience — the server has no such default, it rejects a blank label.

On submit the form posts `FormData` to `uploadResumeVersionAction`.
Validation, ordering, and failure handling are §8. On success the sheet
closes, a toast confirms, and the new version becomes current — the
common case is "this is my newer resume", and a user who wanted
otherwise is one "Set as current" click away.

### Application form (modified)

The application `Sheet` gains a **Resume** select, placed after Status.
Options are **versions**, grouped by their resume using the Radix
select's `SelectGroup`/`SelectLabel`, each shown as its label plus
upload date; the first option is "None". This is why linking is to a
version — the user picks the file, and the grouping tells them which
slot it came from.

The value is the version id; "None" submits `""`, which the schema
transforms to `undefined` (§12.1). A user with no resumes sees the
select disabled with a helper line linking to `/resumes`, rather than an
empty dropdown.

The application table gains a **Resume** column showing
`<slot name> · <version label>`, blank when unlinked. Board cards are
not changed — a card already carries company, role and location, and a
fourth line costs more than it returns at the column widths recorded in
`docs/superpowers/ui-followups.md`.

## 8. Upload, validation, and serving

This is the security core of the phase. Each subsection states a threat
and the control that answers it.

### 8.1 Storage keys — path traversal

**Threat.** A key built from user-controlled text (`../../../etc/passwd`,
`..\\windows`, an absolute path, a NUL byte, a percent-encoded `..`)
escapes the storage root and reads or writes an arbitrary file.

**Control 1 — no user input in a key, by construction.**

```
resumes/<userId>/<randomUUID>.pdf
```

Every segment is server-generated: `userId` from the session,
`crypto.randomUUID()` for the object, `.pdf` as a literal. The
user-supplied filename is stored in `ResumeVersion.originalFilename`
for display and download and **never** touches the key. There is no
code path in Phase 3 that concatenates client text into a key.

The UUID is a fresh one per upload rather than the row's cuid, which
avoids a chicken-and-egg (the key must exist before the row is written,
§8.5) and means the key is not derivable from anything the client sees.

**Control 2 — the driver refuses unsafe keys anyway.** `local-driver.ts`
runs `assertSafeKey(key)` at the top of `put`, `get`, and `remove`:

- the whole key must match `/^[A-Za-z0-9][A-Za-z0-9/_-]*\.[A-Za-z0-9]+$/`
  — which admits no `.`-only segments, no backslash, no NUL, no `%`, no
  whitespace, and no leading `/`;
- no segment may equal `.` or `..`;
- and then, belt and braces,
  `path.resolve(root, key)` must start with `root + path.sep`.

Control 1 means Control 2 should never fire. Control 2 exists because
the day someone adds a key built from a filename is the day the driver
should refuse rather than comply, and because Phase 4 will reuse this
driver with a different key scheme. Its tests (§12.4) assert the
refusals directly.

### 8.2 Content-type spoofing

**Threat.** A client-declared MIME type is not evidence. `file.type`
comes from the browser and is trivially forged; an attacker uploads an
HTML file (or an SVG, or a `.pdf` that is actually a polyglot) declared
as `application/pdf`, and the serving route hands it back for a browser
to interpret as markup on our own origin — stored XSS with session
access.

**Controls, all three required:**

1. **Declared type** must be exactly `application/pdf`. Cheap, rejects
   the honest mistake, proves nothing on its own.
2. **Magic bytes.** The first five bytes must be `%PDF-`
   (`0x25 0x50 0x44 0x46 0x2D`) at offset 0. Real PDFs begin there; an
   HTML document, a ZIP (`PK\x03\x04`), a PNG, or a shell script does
   not. This is the check that actually decides.
3. **The extension is never trusted and never propagated.** The stored
   key ends in a literal `.pdf` we wrote (§8.1); the served
   `Content-Type` is a server-chosen literal (§8.4), never the declared
   or stored value echoed back.

We deliberately stop at the header rather than parsing the file. Full
validation means embedding a PDF parser, and a parser is itself attack
surface — a larger one than the five-byte check closes. Nothing on the
server ever renders or interprets these bytes; the only consumer is the
owner's own browser viewer, and §8.4 makes sure the response cannot be
read as anything but a PDF.

`src/server/files/pdf.ts` owns this: `validatePdfUpload(bytes, declaredType, declaredSize)`
returns `{ ok: true }` or a typed reason. It has no Prisma, no fs, and
no framework import, so it is a pure unit test target.

### 8.3 Size limits — server-side

**Threat.** A 4GB upload fills the disk or exhausts memory. A
client-side `accept` attribute and a JS size check stop neither.

**Controls, outermost first:**

1. `experimental.serverActions.bodySizeLimit: "12mb"` in
   `next.config.ts` — the framework rejects an oversized body before our
   code allocates anything. This is the real backstop.
2. The Zod schema rejects `file.size > 10 * 1024 * 1024` (§12.1). On the
   server `file.size` is the count of bytes Next.js actually parsed, not
   a client claim, but it is checked before the bytes are materialised.
3. After `await file.arrayBuffer()`, `bytes.byteLength` is re-checked
   against the same constant. It costs nothing and it is the only number
   that is unarguably the truth.

The limit lives once, in `src/server/files/pdf.ts`, as
`export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024`, and the client form
imports the same constant so the two can't drift. The 12mb framework
limit is set above it on purpose: a 10.5MB file should produce our
"This file is larger than 10MB" field error, not the framework's opaque
body-size failure.

No decompression happens anywhere, so there is no zip-bomb surface.

### 8.4 Serving — files are private to their owner

**Threat.** Files are servable to anyone who guesses a URL.

**They must not be, and the design makes it structural:**

- **Nothing under `.uploads/` is statically served.** It is outside
  `public/` and outside the Next.js route tree. There is no static path
  to a resume file, guessable or not.
- **There is exactly one route that emits bytes:**
  `GET /api/resume-versions/[id]/file`.
- **That route takes a row id, never a storage key.** No endpoint
  anywhere accepts a storage key from a client.
- **Ids are authorisation-checked, not secrets.** Guessing a valid id
  gets a 404, not a file.

The handler, in order:

```
1. const session = await auth()            → 404 (not 401) with no session
2. resumeService.getVersionForDownload(session.user.id, id)
      → repository findFirst({ where: { id, userId } })
      → not found OR not yours → the same 404, no body distinction
3. const bytes = await storage.get(version.storageKey)
      → null (row without object) → 404, and log server-side
4. return new Response(bytes, { headers })
```

Step 1 returns 404 rather than 401 on purpose: this URL is loaded inside
an `<object>`, and a 401 or a redirect to `/login` renders the login
page *inside the preview frame*, which is a worse failure than an empty
frame with a real fallback link. It is also why this route is
deliberately excluded from the proxy matcher (§11).

Response headers, each one deliberate:

| Header | Value | Why |
|---|---|---|
| `Content-Type` | `application/pdf`, a literal | Never the declared or stored value. The response cannot be typed by the uploader. |
| `X-Content-Type-Options` | `nosniff` | Stops a browser from sniffing the body as HTML regardless of what it contains. The single most important header here. |
| `Content-Disposition` | `inline` (default) or `attachment` when `?download=1` | Preview vs. Save. |
| `Cache-Control` | `private, no-store` | A resume must never sit in a shared cache. |
| `Accept-Ranges` | `none` | At a 10MB ceiling the whole object is one response; advertising ranges we don't implement makes viewers retry. |
| `Content-Length` | the actual buffer length | Not `sizeBytes` from the row — a mismatch would truncate the response. The DB column is for display. |

**`Content-Disposition` is generated, not interpolated.**
`src/server/files/content-disposition.ts` builds it because a filename
is user-supplied text going into an HTTP header, which is a header
injection vector: a `\r\n` splits the response and an unescaped `"`
breaks the parameter. It strips control characters including CR/LF,
strips path separators, truncates to 255, emits an ASCII fallback
reduced to `[A-Za-z0-9._-]` (defaulting to `resume.pdf` if nothing
survives), and adds an RFC 5987 `filename*=UTF-8''…` parameter for the
real name. It is unit tested with CRLF, quote, non-ASCII, and
`../../etc/passwd` filenames.

The same filename is rendered in the UI, where React escapes it — so
the display path needs no additional treatment, and the header path
needs all of the above.

**Residual risk, stated honestly.** PDF is a scriptable format and a
browser's viewer will execute JavaScript embedded in one. We do not
strip it, because stripping requires the parser §8.2 declines to embed.
The mitigation is the threat model: a file is only ever served to the
user who uploaded it, so the attacker and the victim are the same
person. The moment sharing exists — explicitly a non-goal (§3) — this
paragraph stops being sufficient and the feature that introduces
sharing owns re-answering it.

### 8.5 Write ordering and failure

A version upload touches two systems that cannot share a transaction.
The order is **storage first, then database**, inside a transaction for
the database half:

```
1. Validate: auth → Zod → magic bytes → size          (§8.2, §8.3)
2. Resolve and verify the resume slot is the caller's (§5.1)
3. key = resumes/<userId>/<randomUUID>.pdf
4. await storage.put(key, bytes, "application/pdf")
5. await prisma.$transaction([
       create ResumeVersion { userId, resumeId, label, key, … },
       update Resume { currentVersionId: <new id> },
   ])
6. on failure of (5): await storage.remove(key)  — best effort, logged
```

Storage first because the inverse failure is worse: a row written
before its bytes can point at an object that never arrived, and the
preview 404s on a version the library insists exists. An orphaned
object costs disk; a dangling row costs correctness. Step 6 cleans up
the common case, and the uncommon one (process dies between 4 and 5)
leaves an unreferenced object.

Sweeping unreferenced objects is Phase 7's, recorded here rather than
discovered there. It is a bounded, low-risk job: list keys under
`resumes/`, subtract `storageKey` values, delete what is older than a
day.

**Rate limiting and per-user quotas are Phase 7** (Phase 1 §3 already
scoped rate limiting there). Until then the exposure is bounded by
credentials auth on a single-user personal tracker: filling the disk
requires being the account holder.

### 8.6 Preview — the browser's own viewer

`src/components/pdf-preview.tsx`:

```tsx
<object data={src} type="application/pdf" aria-label={`Preview of ${label}`}>
  {/* Real fallback, not decoration: iOS Safari and some mobile
      browsers do not render PDFs in-page at all. */}
  <p>
    Your browser can’t preview PDFs. <a href={src}>Open {label}</a> or{" "}
    <a href={`${src}?download=1`}>download it</a>.
  </p>
</object>
```

`<object>` rather than `<iframe>` or `<embed>` because it is the only
one of the three with a standard fallback-children mechanism, and the
fallback is a genuine requirement rather than a nicety — a mobile user
must get a working link, not a blank rectangle. `src` is always the
§8.4 route; the component cannot be given a raw file path because none
exists.

The box has a fixed aspect ratio and a minimum height so the page does
not reflow when the viewer loads, and no spinner: `<object>`'s load
event is unreliable across browsers and the native viewer draws its own
loading state. Faking one would be a fake UI.

## 9. Resume analytics

Derived entirely from the existing pipeline. **No new tracking tables**
— the join `Application.resumeVersionId → ResumeVersion.resumeId` is
the whole data source.

Per resume:

| Figure | Definition |
|---|---|
| Applications | applications whose `resumeVersionId` is any version of this resume |
| At interview or beyond | of those, status in `INTERVIEW`, `OFFER`, `ACCEPTED` |
| Offers | of those, status in `OFFER`, `ACCEPTED` |
| Rejected | of those, status `REJECTED` |
| Interview rate | *At interview or beyond* ÷ *Applications* |
| Offer rate | *Offers* ÷ *Applications* |

Computed in **one grouped query**, not per-resume:

```ts
prisma.application.groupBy({
  by: ["resumeVersionId", "status"],
  where: { userId, resumeVersionId: { not: null } },
  _count: { _all: true },
})
```

folded to resume level in memory against the user's version list. It
lives in `resume-repository.ts` even though it queries
`prisma.application`, following the precedent of
`companyRepository.countApplications`, which does the same thing for
the same reason.

**Two honesty constraints on how this is presented, both binding:**

**(a) The rates understate, and the UI says so.** `Application.status`
is a *current* state, not a history: an application that interviewed and
was then rejected has status `REJECTED` and counts only in *Rejected*.
So "interview rate" here means "currently at interview or beyond", which
is why the table column is labelled exactly that rather than "Reached
interview". A true reached-stage rate needs a status-history table —
which Phase 6 needs anyway for stage-to-stage conversion, and which is
explicitly not built here. The detail page carries one line of
microcopy saying so. Overclaiming a metric is worse than not showing it.

**(b) Unlinked applications are visible, not silently dropped.**
Applications with a null `resumeVersionId` appear in no resume's
numbers. `/resumes` shows "N applications have no resume linked" with a
link to the filtered table, so the totals are never quietly partial.

A resume with zero linked applications shows "Not used yet", not
`0%` — a percentage with a zero denominator is a lie with a division
sign in it.

## 10. Navigation

`src/config/site.ts` gains one entry, between Companies and Settings:

```ts
{ title: "Resumes", href: "/resumes", icon: FileText },
```

That is the whole navigation change. The sidebar reads this list as
data, as Phase 1 designed it. Still no entries for unbuilt modules.

## 11. Route protection

Next.js 16 renamed middleware to **proxy**, so the file is
`src/proxy.ts`. It gates routes in two places that must be kept in
sync — the `PROTECTED_PREFIXES` array and `config.matcher` — and Phase 2
learned that updating only one half-protects the route silently. Both
gain `/resumes`:

```ts
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/applications", "/companies", "/resumes"]
// matcher: … , "/resumes/:path*"
```

**`/api/resume-versions/:path*` is deliberately NOT added to either.**
The route authenticates itself and returns 404 (§8.4); adding it to the
proxy would make an unauthenticated request redirect to `/login`, and
that redirect is followed *inside the `<object>` element*, rendering the
login page in the preview frame. A 404 with no body is the correct
answer to "give me a file you may not have". Skipping the proxy costs
nothing here because the handler's own `auth()` call is the control —
middleware protects navigation, handlers and actions protect data.

Every Server Action independently calls `auth()` and returns
`{ success: false, formError: "Unauthorized." }` without a session,
matching every action in Phases 1 and 2. No new action gets an
exception.

## 12. Cross-cutting concerns

### 12.1 Validation

`src/server/validators/resume-schemas.ts`. Zod 4, and the house rule
holds without exception: **`.optional()` must be the outermost wrapper**
— applying `.transform()` after `.optional()` hides the optional marker
from key inference and yields a required key. This has bitten the
project twice and the comment at the top of `company-schemas.ts`
explains it; the new file carries the same warning.

```ts
export const createResumeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  notes: z.string().trim().max(500)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),                                   // ← outermost
})

export const uploadResumeVersionSchema = z.object({
  resumeId: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(100),
  file: z.instanceof(File)
    .refine((f) => f.size > 0, "Choose a file")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, "This file is larger than 10MB")
    .refine((f) => f.type === "application/pdf", "Only PDF files are supported"),
})

export const setCurrentVersionSchema = z.object({
  resumeId: z.string().min(1),
  versionId: z.string().min(1),
})
```

`z.instanceof(File)` works on both sides: `File` is a global in the
browser and in Node ≥20 (this project runs Node 22), so the client
resolver and the Server Action share one schema, as every other form in
the app does.

The **magic-byte check is not in the schema** — it needs the bytes, and
`validatePdfUpload` in `src/server/files/pdf.ts` owns it. The action
runs the schema, then reads the bytes, then runs the byte check, and
maps its failure to a field error on `file` like any other.

`application-schemas.ts` gains one field on `applicationFields`, which
flows to both the create and update schemas:

```ts
resumeVersionId: z.string()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .optional(),                                     // ← outermost
```

Note the empty-string branch comes before the transform, the same
pattern the existing optional fields use so a cleared select saves as
null rather than as `""`.

Phase 2's debt list records that `Company.notes` caps at 500 and
`Application.notes` at 2000, an arbitrary divergence. `Resume.notes`
takes 500, matching `Company.notes`, because it is the same kind of
short descriptive line. This phase does **not** fix the existing
divergence — that remains debt.

### 12.2 Error handling

Typed error classes thrown by services and mapped to field or form
errors by actions, exactly as in Phases 1 and 2:

| Error | Mapped to |
|---|---|
| `ResumeNameTakenError` | field error on `name` |
| `ResumeNotFoundError` | `notFound()` on a page; generic not-found in an action |
| `ResumeInUseError(count)` | the §7 inline refusal naming the count |
| `ResumeVersionNotFoundError` | generic not-found |
| `ResumeVersionNotOwnedError` | field error on `resumeVersionId` (message "Resume not found" — it must not confirm the version exists) |
| `InvalidPdfError` | field error on `file`: "That file isn’t a PDF." |
| `FileTooLargeError` | field error on `file`: "This file is larger than 10MB." |
| `StorageError` | generic form error |

Two rules with teeth:

- **No filesystem path ever reaches the client.** A Node `ENOENT` or
  `EACCES` carries an absolute path, which discloses the server layout.
  Storage failures are caught in the service, logged server-side with
  the key, and rethrown as `StorageError` whose message is the generic
  "Something went wrong. Please try again."
- **Not-found and not-yours produce identical output** at every layer,
  including the serving route (§8.4) and the link-ownership error above.

### 12.3 Loading states

`loading.tsx` skeletons for `/resumes` and `/resumes/[id]`. The detail
skeleton must carry the same layout constraints as the real page —
Phase 2 shipped a board skeleton that overflowed the viewport because it
did not (`docs/superpowers/ui-followups.md` item 3), so the preview
skeleton is the same fixed-aspect box the `<object>` occupies.

Sheet submit buttons disable and show pending text while their action
runs. The upload button reads "Uploading…". **There is no progress
bar** — a Server Action exposes no upload progress, and a bar that sits
at 0 and jumps to 100 is a fake UI (§3).

### 12.4 Testing

**Unit (Vitest, no database):**

- `resume-schemas.test.ts` — valid and invalid cases, and specifically
  that an omitted `notes` / an omitted `resumeVersionId` produces an
  *optional key*, not `undefined` on a required one. That is the
  regression test for the Zod-4 footgun this project has hit twice.
- `pdf.test.ts` — `%PDF-` accepted; an HTML document declared as
  `application/pdf` rejected; a ZIP header rejected; an empty buffer
  rejected; `MAX_UPLOAD_BYTES + 1` rejected; exactly `MAX_UPLOAD_BYTES`
  accepted.
- `local-driver.test.ts` — against a temp directory: put/get/remove
  round-trip, `get` of an absent key returns null, `remove` of an absent
  key resolves. Then the refusals, each asserted individually:
  `../../etc/passwd`, `resumes/../../x.pdf`, `/etc/passwd`,
  `..\\windows\\x.pdf`, `resumes/%2e%2e/x.pdf`, `a\0b.pdf`, `""`, and a
  key with no extension. **And one test that the resolved path of a
  legitimate key stays inside the root**, so the final `path.resolve`
  guard is covered and not merely present.
- `content-disposition.test.ts` — CRLF, embedded `"`, non-ASCII, a
  filename that reduces to nothing, and `../../etc/passwd`.

**Integration (real dev database, cleaning up their own rows):**

- `resume-repository.test.ts` and `resume-service.test.ts`, including
  the ownership battery: seed two users, then assert user B cannot read,
  rename, or delete user A's resume; cannot upload a version into it;
  cannot set A's version current on their own resume; and cannot link
  A's version to B's application. Every attempt must be
  indistinguishable from not-found.
- `getVersionForDownload(B, <A's version id>)` returns nothing, which is
  the unit-level proof behind §8.4's 404.
- Delete refusal: a resume whose version an application references
  raises `ResumeInUseError` with the right count and deletes nothing —
  neither row nor object.
- The §8.5 rollback: a failing transaction leaves no object behind.

**E2E (`e2e/resumes.spec.ts`):**

1. unauthenticated `/resumes` redirects to `/login?callbackUrl=%2Fresumes`;
2. sign up → create a resume slot → upload `e2e/fixtures/sample.pdf`
   with a label → it shows as current, version count 1;
3. upload a second file → two versions, the second is current;
4. "Set as current" on the first → the badge moves;
5. attempt to upload `e2e/fixtures/not-a-pdf.pdf` (HTML with a `.pdf`
   name) → a field error on the file input and **no new version row**.
   This is the test that proves §8.2 end to end;
6. create an application and link it to a version → the resume's "Used
   by" shows it;
7. delete the resume → refused, message names 1 application;
8. unlink → delete succeeds.

Playwright's raised timeouts from Phase 1 apply; the remote database
makes every action multi-second.

**Process lesson carried forward from Phase 2, and binding here:** run
`pnpm lint` in **every** task's verification step, not only the final
one. Phase 2 verified with `tsc` and `build` per task and lint only at
the end, and a real defect introduced in task 13 survived six further
tasks.

## 13. Spec self-review notes

- **Placeholder scan:** none remain. Every model, column, cascade rule,
  header, error class, route, constant and test case above is specified
  concretely. The one number chosen by judgement rather than derivation
  — `bodySizeLimit: "12mb"` — states its reasoning inline.
- **Internal consistency:** §6's `onDelete: Restrict` on
  `Application.resumeVersion` matches §7's refusal message and §12.2's
  `ResumeInUseError`; §3's "no version deletion" matches §6's absence of
  a delete operation and §8.5's cleanup being upload-rollback only;
  §4's "no pdf.js" matches §8.6's `<object>`; §5.2's `get`-returns-bytes
  matches §6 storing `contentType` on the row and §8.4 sending a
  literal. Checked and consistent.
- **Ambiguity check:** the three places a reader could reasonably ask
  "which did you mean" are resolved explicitly — (a) whether a link
  points at a resume or a version (§6: a version, with the reason);
  (b) whether an unauthorised file request 404s or 401s (§8.4: 404, with
  the `<object>` reason); (c) whether "interview rate" means *reached*
  or *currently at* (§9: currently at, with the label that says so and
  the pointer to the history table Phase 6 needs).
- **Security review:** the four named risks are each answered with a
  control and a test — path traversal (§8.1, two independent controls,
  tested), content-type spoofing (§8.2 three controls, tested end to
  end), server-side size enforcement (§8.3, three layers, one shared
  constant), and private serving (§8.4, one authorising route, no static
  path, no key-accepting endpoint). Two residual risks are stated rather
  than hidden: PDF is scriptable and we do not strip it (mitigated by
  owner-only serving, and re-opened by any future sharing feature), and
  upload rate limiting is Phase 7.
- **Scope check:** one implementation plan's worth. The storage layer,
  the models, and the linking column are inseparable — the link needs a
  version, a version needs bytes, and bytes need the driver.
- **Known deferrals, recorded not discovered:**
  - **Individual version deletion** (§6) is the decision here most
    likely to be revisited. When it is, it must answer current-version
    repointing, referenced-version refusal, and storage cleanup
    together.
  - **Orphaned storage objects** (§8.5) and **upload rate limiting /
    quotas** (§8.3) → Phase 7.
  - **A status-history table** (§9) → Phase 6, which needs it for
    stage-conversion analytics regardless.
  - **A cloud storage driver** (§5.2) → Phase 7, as one new file and one
    `case` in `getStorage()`.
  - Phase 2's `notes` length divergence (§12.1) is untouched and remains
    on the debt list.

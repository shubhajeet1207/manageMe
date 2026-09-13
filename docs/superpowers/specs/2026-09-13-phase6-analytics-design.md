# ManageMe — Phase 6: Analytics — Design Spec

**Date:** 2026-09-13
**Status:** Approved for implementation planning
**Author:** Claude (with shubhajeet.pradhan@mindtickle.com)
**Baseline:** `main` at `8bc45a4`. Phases 1–5 are shipped: 12 Prisma models, 5
applied migrations, 21 production dependencies, no charting library.

---

## 1. Context

Phase 1 §1 scoped this phase in six words: *"dashboard widgets, career
analytics, activity timeline."* `docs/superpowers/roadmap.md` §2.1 then
established — correctly, and at length — that those three deliverables sit on a
prerequisite the original plan did not contain: **nothing in this schema records
that an application's status ever changed.**

That analysis is not repeated here. It is taken as settled, and this spec builds
on it. The one-line summary, for a reader who arrives at this document first:

> `Application.status` is a *current state*. `createdAt` is when the row was
> made — and the create form offers all seven statuses, so a row can be born as
> `INTERVIEW`. `updatedAt` moves when a typo in a note is fixed. `appliedAt` is
> user-typed, optional, and covers one transition. There is no fourth timestamp.
> Every reached-stage count, every stage-to-stage conversion, every duration,
> and the activity timeline itself have no source in any of the 12 models.

The roadmap splits the recorder out as its own phase (6a) precisely because its
value is proportional to how long it has been recording, and Phase 6 cannot
satisfy its own prerequisite. **This spec accepts that framing and ships the
recorder as §6–§8, first, as a self-contained unit that could be merged and
deployed on its own before a single chart exists.** §9 onward is the analytics.
If implementation is split across two plans, the seam is between §8 and §9 and
nowhere else.

The phase's starting point also moved. Commit `b2c1cbe` rewrote
`src/app/(app)/dashboard/page.tsx` into three stat tiles and a seven-stage
pipeline strip, all computed from one `listApplications` call and nine in-memory
filters. So the brief is not "build a dashboard" — it is **add a time axis to an
already-honest current-state page, without making any of it less honest.**

The standard for that is already set in this repository, one module over.
`src/app/(app)/resumes/[id]/resume-usage.tsx:75-82` renders four usage figures
and then says, in the product, unprompted:

> These count where applications stand *now*, not every stage they reached: one
> that interviewed and was then rejected counts only under Rejected. A true
> reached-stage rate needs status history, which this phase does not record.

Every figure in this phase is held to that. A metric that reads as precise and
rests on one synthetic row says so on screen, in the same voice, at the same
size — not in a tooltip, not in a footnote nobody scrolls to.

---

## 2. Goals

- **Record every status transition, from today forward, from every path that can
  cause one** — with a single chokepoint, so that a future fourth path cannot
  bypass it quietly, and with a detector that makes a bypass loud if it happens
  anyway.
- **Backfill exactly one synthetic row per existing application**, marked as
  synthetic, and keep it structurally impossible for that row to be mistaken for
  a recorded observation anywhere in the product.
- A **career analytics page** (`/analytics`) showing the pipeline funnel,
  stage-to-stage conversion, time-in-stage, applications over time, per-company
  outcomes and per-resume outcomes — each figure labelled with what it can
  honestly claim and what its denominator is.
- An **activity timeline** spanning applications, resumes, documents and tasks.
- The **dashboard gains a time axis** and loses its one misleading label, and its
  ten integers come from one `groupBy` instead of an N-row fetch.
- **Every chart is a Server Component with no client JavaScript and no new
  dependency.**
- A user can only ever read their own events. Enforced at the repository layer,
  by the same mechanical rule as Phases 2–5.

---

## 3. Explicit non-goals (deferred)

Five are given by the brief and are not re-argued:

- **Forecasting** — "you will get an offer in 5 weeks" over 40 observations is a
  number with an error bar wider than its value.
- **Benchmarking against other users** — there are none, and Phase 5 §9.1's
  single-reader threat model is what makes half of this app's security
  reasoning work.
- **Exports** (CSV, PDF, "download my analytics") — refused in Phase 2 §3 and
  Phase 4 §3 as additive, not structural. Still additive.
- **Scheduled reports** — needs the email infrastructure Phase 9 owns and
  nobody has built.
- **AI insights** — refused in Phase 3 §3 and Phase 4 §3. Also: an LLM
  summarising 23 rows is a confident sentence about noise.

Five more are refused here, with reasons:

- **Resume skill A/B ("do resumes mentioning Kubernetes interview better?")** —
  named in `prisma/schema.prisma`'s comment on `Resume.skills` as a Phase 6
  target. Refused on **sample size, not difficulty**: the query is one
  `hasSome` filter. At 40–120 applications split across 4 resumes and a dozen
  free-text skill tags, every cell has single-digit n, and the feature's entire
  output would be differences that are noise. `Resume.skills` stays queryable;
  this phase declines to render a finding from it. Revisit at a few hundred
  applications.
- **Source-of-application effectiveness as a chart** — `Application.source` is
  free text, so "LinkedIn", "linkedin" and "Linkedin" are three sources. §9.9
  shows a raw counted list instead. A pie chart implies a closed taxonomy that
  does not exist.
- **Cross-currency salary statistics** — `Application.currency` is free-text
  `String(10)`. A median across mixed INR/USD is arithmetic on incomparable
  numbers. Grouped-by-currency distributions only, with the coverage sentence.
- **Table sorting** — the roadmap homes Phase 2's unshipped §7 promise here, on
  the reasoning that 6b "is already changing repository ordering." **It is
  not.** Every query this phase adds is a new function; `listByUser` and
  `listByCompany` keep their `updatedAt desc` ordering untouched. The rationale
  for homing it here does not hold, so it goes back to whoever next opens
  `application-table.tsx`. `README.md:11`'s false "sortable table" claim stays
  on the debt list, unchanged by this phase.
- **Reordering the board by last status change** — now computable for the first
  time, and deliberately not taken. `listByUser`'s `updatedAt desc` is a small
  lie (roadmap §2.1) but it is a *stable* one; switching the board's order would
  move cards under the user's cursor for a benefit nobody asked for. Recorded as
  available, not adopted.

---

## 4. Tech additions

**None. Zero new dependencies.** This is a decision, argued in §10, not an
omission.

No new UI primitives are generated either. The phase uses `table`, `badge`,
`skeleton` and `separator`, all of which already exist, plus native `<details>`
for each chart's table-view twin — which is also what keeps the page free of
client JavaScript.

One Prisma migration: `add_application_status_event`.

---

## 5. Architecture

Unchanged:

```
UI → Server Action → Service → Repository → Prisma → PostgreSQL
```

with a notable local property: **this phase adds no Server Actions.** Analytics
is read-only. Every interactive control — the time range, the timeline's
pagination — is a `<Link>` that changes `searchParams` and re-renders a Server
Component. That has a validation consequence, not an absence of one: see §15.1.

### 5.1 The ownership rule, as it applies here

Phase 2 §5.1 set it and Phases 3–5 inherited it verbatim:

> Every repository function that touches a user-owned row takes `userId` as its
> first parameter and includes it in the `where` clause. Reads use
> `findFirst({ where: { id, userId } })`, never `findUnique({ where: { id } })`.
> Writes use `updateMany`/`deleteMany` scoped by `{ id, userId }` and branch on
> the returned `count`. Missing and not-yours are indistinguishable to the
> caller — see `src/server/repositories/company-repository.ts`.

`ApplicationStatusEvent` carries its own `userId`, denormalised from
`Application`, **for exactly the reason `ResumeVersion.userId` and
`ResumeProject.userId` do** (Phase 3 §5.1a, quoted in the schema):

> it is what lets the ownership rule stay mechanical — `where: { id, userId }`
> rather than `where: { id, application: { userId } }`, which is a relation
> filter a future edit can drop without the type system noticing.

That reasoning is stronger here than it was for resumes, because analytics
queries are *aggregates*. A dropped relation filter on a `findFirst` returns
someone else's row and is likely to be noticed. A dropped relation filter on a
`groupBy` returns a funnel chart that silently includes every user's
applications — a wrong number, rendered beautifully, with no error. Every
aggregate in `analytics-repository.ts` is scoped by a **top-level** `userId` on
the event or application row, never by a join.

**Aggregate queries take `userId` first and it appears in the top-level `where`
of every one of them.** There is no exception in this phase.

### 5.2 Cross-entity guards

This phase writes no client-supplied foreign ids, so it adds no new guard. The
existing ones (`assertCompanyOwned`, `assertResumeVersionOwned`,
`assertApplicationOwned`) are untouched and still run on the application write
paths that §7 modifies — the chokepoint wraps those paths, it does not replace
their service-layer checks.

One thing worth stating because it is the kind of thing that gets got wrong:
`ApplicationStatusEvent.applicationId` is **never** client-supplied. It comes
from the row the repository just wrote, inside the same transaction. There is no
action, no schema and no service function anywhere in this phase that accepts an
application id and writes an event against it.

### 5.3 Folder structure (additions only)

```
src/
  app/(app)/
    analytics/
      page.tsx                   # the career analytics view (Server Component)
      loading.tsx
      format.ts                  # week bucketing, median, coverage phrasing
      format.test.ts
      coverage-note.tsx          # the honesty banner and the per-figure captions
      stat-tiles.tsx
      funnel.tsx
      conversion-strip.tsx
      stage-durations.tsx
      weekly-columns.tsx         # one single-series column chart, used 3×
      company-outcomes.tsx
      resume-outcomes.tsx
      activity-list.tsx          # shared by the preview and the full feed
      activity/
        page.tsx                 # the paginated full timeline
        loading.tsx
  server/
    repositories/
      status-event-repository.ts       # READ ONLY — see §7.2
      status-event-repository.test.ts
      analytics-repository.ts          # the aggregates
      analytics-repository.test.ts
    services/
      analytics-service.ts
      analytics-service.test.ts
    validators/
      analytics-schemas.ts             # searchParams only
      analytics-schemas.test.ts
prisma/migrations/
  <ts>_add_application_status_event/
    migration.sql
```

Modified:

| File | Change |
|---|---|
| `prisma/schema.prisma` | `ApplicationStatusEvent`, `StatusEventSource`, back-relations, one index on `Task` (§6.6) |
| `src/server/repositories/application-repository.ts` | the chokepoint (§7.2); `create`, `update`, `updateStatus` rewritten to route through it |
| `src/server/repositories/application-repository.test.ts` | the event assertions and the export tripwire (§15.4) |
| `src/server/repositories/resume-repository.ts` | `ResumeStats` gains `reachedInterview` / `reachedOffer` (§9.8) |
| `src/app/(app)/resumes/[id]/resume-usage.tsx` | the caveat paragraph at `:75-82` is **amended, not deleted** (§9.8) |
| `src/app/(app)/dashboard/page.tsx` | `groupBy`, the relabel, the new tile, the link (§9.2) |
| `src/app/(app)/dashboard/loading.tsx` | skeletons the Pipeline section it currently omits |
| `src/config/site.ts` | one nav entry (§13) |

---

## 6. Database schema

```prisma
/// One recorded status transition. Append-only: there is no update operation
/// and no delete operation anywhere in the codebase, and the only INSERT is
/// inside application-repository.ts's chokepoint (§7.2).
model ApplicationStatusEvent {
  id            String             @id @default(cuid())
  /// Denormalised from Application for the same reason as ResumeVersion.userId
  /// and ResumeProject.userId (§5.1): it keeps every where-clause a top-level
  /// scalar filter. It matters more here than there, because a dropped filter
  /// on an aggregate is a wrong chart, not a visible leak.
  userId        String
  applicationId String
  /// Null on the genesis event and nowhere else. Stored rather than derived,
  /// because a redundant column is the only thing that makes a missed write
  /// detectable — see §6.2 and §7.5.
  fromStatus    ApplicationStatus?
  toStatus      ApplicationStatus
  changedAt     DateTime           @default(now())
  /// Which path wrote this row. BACKFILL rows are synthetic and are excluded
  /// from every duration and conversion figure (§8.3).
  source        StatusEventSource

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([userId, applicationId, changedAt])
  @@index([userId, changedAt])
  @@index([userId, toStatus])
}

enum StatusEventSource {
  CREATE
  BOARD_DRAG
  EDIT_FORM
  BACKFILL
}
```

`User` gains `statusEvents ApplicationStatusEvent[]`; `Application` gains
`statusEvents ApplicationStatusEvent[]`.

### 6.1 Shape: per-transition rows, not per-entry

The two candidate shapes:

| | **Per-transition** (chosen) | **Per-entry** (rejected) |
|---|---|---|
| Row means | "it moved from A to B at T" | "it was in stage B from T1 to T2" |
| Columns | `fromStatus?`, `toStatus`, `changedAt` | `status`, `enteredAt`, `exitedAt?` |
| Writes per transition | one INSERT | one INSERT **and one UPDATE** of the open row |
| Time-in-stage | subtract adjacent rows | read one column |
| Can a row be wrong after it is written? | no | yes — `exitedAt` is written later |

**Per-transition wins on the property that matters: it is append-only.** A
per-entry table requires closing the previous row — an UPDATE — on every
transition. That means: (a) there is code in the repository that mutates
history, so "history cannot be rewritten" stops being a structural fact and
becomes a convention; (b) a crash between the close and the insert leaves either
two open rows or a gap, and neither is detectable from the data; (c)
`exitedAt` on row N and `enteredAt` on row N+1 are the same instant stored
twice, which is a consistency obligation forever.

Per-entry's advantage — time-in-stage is a column read rather than a window
function — is worth nothing here. The whole event table for one user after a
year is a few hundred rows. The durations in §9.5 are computed by sorting each
application's events in memory after a single indexed fetch. There is no query
this phase runs that per-entry would make meaningfully faster, and there is a
whole class of corruption it would make possible.

The trade-off accepted: a stage that is *currently occupied* has no closing row,
so its duration is open-ended. §9.5 reports that separately and explicitly
("currently in Screening, 12 days") rather than pretending it is a closed
interval — which is more honest than a per-entry table's NULL `exitedAt` would
have made it, since a NULL there is ambiguous between "still here" and "the
close was missed."

### 6.2 `fromStatus` is stored, and it is nullable exactly once

**Stored, not derived.** A window function over `changedAt` could compute
`fromStatus` as the previous row's `toStatus`. That is strictly worse, and the
reason is the entire risk model of this feature: *the failure mode is a missed
write.* Derivation makes a gap look like a legitimate transition forever —
`SAVED → INTERVIEW` is a perfectly well-formed row whether the user dragged
across four columns or whether two writes in between were never recorded.
Storing `fromStatus` against a before-image read from the live row turns a gap
into a **contradiction**: the recorded `fromStatus` will not match the previous
row's `toStatus`. That is a one-query invariant, it is a test (§15.4), and it is
a visible drift check in the product (§7.5).

The redundant column costs one enum per row and buys the only detector this
feature has. Take it.

**Nullable, and the nullability is load-bearing.** `fromStatus` is `NULL` on
exactly one row per application: the genesis event, recorded at create time,
whose meaning is "this application began here." Two alternatives were
considered and both are worse:

- **Make it non-null and use `SAVED` as the origin of the genesis row.** This is
  fabricated data. `applicationFields.status` defaults to `SAVED`, but
  `application-sheet.tsx` renders all seven options, so an application created
  directly as `INTERVIEW` never passed through `SAVED`. A `SAVED → INTERVIEW`
  genesis row asserts a transition that did not happen, and it would flow
  straight into the funnel as a reached-`SAVED`.
- **Make it non-null and set `fromStatus = toStatus` on genesis.** This
  manufactures a zero-duration stage, which is exactly what §7.4's no-op guard
  exists to prevent, and it makes "is this the genesis row?" a comparison of two
  columns rather than a null check.

`fromStatus IS NULL` is the machine-checkable definition of a genesis row, and
"exactly one genesis row per application" is a test.

### 6.3 The genesis event is not always `SAVED`

Stated separately because it is the single easiest thing to get wrong here. The
genesis event's `toStatus` is **whatever the form submitted**, read from the row
that was just created — never a hardcoded `SAVED`, never
`applicationFields.status`'s default. A hardcoded genesis is fabricated data
that no test comparing against the default would catch.

### 6.4 `onDelete: Cascade` on the application relation — the argued call

The roadmap flags this as the owner's call and refuses to let it be defaulted.
It is **Cascade**, and it is a deliberate divergence from Phase 2's
`Restrict`-on-company and Phase 3's `Restrict`-on-resume-version, both of which
were chosen for the "don't silently destroy history" reason that appears to
argue the other way here.

The argument for Cascade:

1. **Deleting an application usually means "this was never real."** A duplicate
   row, a typo, a job that turned out to be a repost. Phase 2 shipped deletion
   as permanent with no archive state precisely because that is the use case.
   Retaining the transition history of a row the user deleted as a mistake is
   retaining noise, and it would silently inflate every funnel denominator.
2. **The alternative that preserves history does not preserve meaning.** Keeping
   events and nulling the FK requires a denormalised company/role snapshot on
   the event, or the retained rows say "something moved to Interview" with no
   subject. That is two more columns and a sync obligation forever — the
   snapshot has to be written on every event and can drift from the application
   the moment a role title is corrected.
3. `Restrict` is not on the table. It would make an application undeletable the
   moment it had any history, which is every application.

**The cost, stated plainly and not hidden:** *your conversion rates change
retroactively when you tidy up.* Delete three old applications that never got
past `SAVED` and your screening rate improves, with no event and no explanation.
This is the strongest argument against Cascade and it is real. It is accepted
because the alternative's permanent complexity is worse than an occasional
silent recomputation on an action the user took deliberately — and because a
single-operator app has no audit requirement that a deleted row's history
survive its subject.

`onDelete: Cascade` from `User` matches every other model. If an account is
deleted its data goes with it.

### 6.5 Indexes

| Index | Serves |
|---|---|
| `[userId, applicationId, changedAt]` | one application's ordered history — the chokepoint's before-image sanity check, the drift check, per-application durations |
| `[userId, changedAt]` | the activity timeline's cursor page, and "moved in the last 7 days" |
| `[userId, toStatus]` | the reached-stage funnel — `groupBy toStatus` over one user's events |

All three lead with `userId`, which is both the ownership filter and the highest
-selectivity column in a table where one user owns every row they can see.

### 6.6 The one change to an existing model

`Task` gains `@@index([userId, completedAt])`.

Honest framing: this buys nothing measurable today. At a few hundred tasks a
sequential scan is microseconds. It is included because the activity timeline
makes `completedAt` a **sort key** for the first time (`orderBy: { completedAt:
"desc" }` with a `lt` cursor), the existing `[userId, status, dueDate]` index
does not serve that at all, and the migration is already open. It is the only
change this phase makes to an existing model, and it changes no column, no
constraint and no behaviour.

---

## 7. Where rows are written

This is the part that goes wrong silently. A missed write produces no error, no
warning, no degraded mode and no symptom — it produces a funnel chart that is
quietly wrong forever.

### 7.1 Every path that can change a status, enumerated

Verified against `8bc45a4` by grepping every `prisma.application` access in
`src/` and `e2e/`. **All Prisma access lives in `src/server/repositories`**;
`src/app/api/` holds only the NextAuth route and a read-only file route; there
is no seed script, no import, no bulk action, no admin surface.

| # | Repository function | Reached from | Can it change status? |
|---|---|---|---|
| 1 | `create` (`application-repository.ts:30`) | `createApplication` ← `createApplicationAction` ← the create sheet | **Yes — to any of the seven.** `application-sheet.tsx` renders a full status select, so an application can be *born* as `INTERVIEW`. |
| 2 | `updateStatus` (`:66`) | `changeStatus` ← `changeStatusAction` ← the board's pointer drag **and** its keyboard drag | Yes, that is all it does. |
| 3 | `update` (`:34`) | `updateApplication` ← `updateApplicationAction` ← the edit sheet | **Yes — `status: data.status` is written unconditionally as one field of a full-row write.** |
| 4 | `remove` (`:76`) | delete dialog | No — the row goes. |

**Path 3 is the one that silently breaks this.** A reviewer who reads
`changeStatus` will conclude that status writes are centralised in the board
drag. They are not. The edit sheet shares the same seven-option select as the
create sheet, writes status as an ordinary field, and is reachable from every
board card, the applications table, *and* the company detail page. Miss it and
the funnel under-counts forever, with no error and no symptom. It is called out
here, in the schema comment, and in a named test.

### 7.2 The chokepoint

**The chokepoint is one private function in
`src/server/repositories/application-repository.ts`, and it is the only place in
the codebase that writes `Application.status` or inserts an
`ApplicationStatusEvent`.**

```ts
type StatusWrite<T> = {
  userId: string
  /** Null on create: there is no before-image to read. */
  existingId: string | null
  next: ApplicationStatus
  source: StatusEventSource
  write: (tx: Prisma.TransactionClient) => Promise<T | null>
}

async function commitStatusWrite<T extends { id: string }>({
  userId,
  existingId,
  next,
  source,
  write,
}: StatusWrite<T>): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const previous = existingId
        ? ((
            await tx.application.findFirst({
              where: { id: existingId, userId },
              select: { status: true },
            })
          )?.status ?? null)
        : null

      if (existingId !== null && previous === null) return null

      const row = await write(tx)
      if (row === null) return null

      if (previous !== next) {
        await tx.applicationStatusEvent.create({
          data: {
            userId,
            applicationId: row.id,
            fromStatus: previous,
            toStatus: next,
            source,
          },
        })
      }

      return row
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}
```

`create`, `update` and `updateStatus` become thin callers that hand it a `write`
callback and never touch `prisma.application` directly.

Two structural consequences, both deliberate:

- **`applicationStatusEvent.create` appears exactly once in the codebase.**
- **`status` is removed from the public functions' own Prisma payloads.** They
  pass it as `next` to the chokepoint; the callback writes it. So adding a
  fourth status writer requires typing `status:` into a Prisma `data` block in
  a file whose one job is now this — under the nose of the function whose name
  says what it is for.

**Where the write does *not* go, and why:**

| Rejected location | Why |
|---|---|
| **The service layer** (`application-service.ts`) | It cannot know whether the write landed. `update` and `updateStatus` use `updateMany` for ownership scoping and branch on `count === 0`; the service sees only a nullable return. Writing the event there means either writing it for a no-op, or re-reading — and a re-read outside the transaction races the board. |
| **Prisma middleware / `$extends`** | It needs a separate re-read for the before-image, on every write, racing the same way. And it hides the write where nobody reading `application-service.ts` or `application-repository.ts` will find it, which is the opposite of what a feature whose failure mode is invisibility needs. |
| **A shared helper the three paths call** | A helper you must remember to call is precisely the bypassable thing. The chokepoint is a *wrapper*: the paths cannot perform their own write without going through it, because the write is its callback. |
| **A database trigger** | Genuinely enforcing, and genuinely rejected: it would put a load-bearing piece of application logic in a place Prisma's schema does not describe, invisible to `prisma migrate diff`, untestable by the existing Vitest suite, and unreadable by anyone reviewing the repository. Reconsider only if this app ever grows a second writer process. |

Precedent for the shape: `resume-repository.ts:125` `createVersionAndSetCurrent`
already wraps `prisma.$transaction` with the ownership check *inside* it, and
uses a private error class to roll back.

**`status-event-repository.ts` exports no write function at all.** It is reads
only — the timeline page, the funnel aggregates, the drift check. Append-only is
not a convention in a comment; it is the absence of any code that can update or
delete an event.

### 7.3 Atomicity and isolation

**The status write and the event insert both happen or neither does.** One
interactive `prisma.$transaction`, both writes on the same `tx`. There is no
arrangement in which a status moves without a row, or a row exists for a status
that did not move.

**Isolation is `Serializable`, explicitly.** The before-image read and the write
are two statements; under Postgres's default Read Committed, two concurrent
drags can both read `SCREENING` and both write an event claiming to originate
there — one of which never happened. `Serializable` makes the read-then-write
atomic by definition. On a serialization failure Postgres raises `40001`, Prisma
surfaces `P2034`, and the chokepoint **retries once** before returning the
failure to the service, which maps it to the existing generic error.

The cost, weighed: `Serializable` now also covers `update`'s full 13-column
write. At this scale — one user, a handful of writes a day, one row per
transaction — the conflict window is a human dragging two cards inside the same
millisecond. The retry will effectively never fire. It is specified anyway
because "effectively never" is not a correctness argument and the retry is four
lines.

**The alternative considered and rejected: compare-and-set.** Scope the update
as `updateMany({ where: { id, userId, status: previous }, ... })` and treat
`count === 0` as a conflict. It is cheaper, but it breaks two things. It makes
an edit-sheet save *fail* when a board drag lands mid-edit — the user loses a
form's worth of typing to a race they did not cause — and it collapses
"not yours", "not found" and "status moved under you" into one indistinguishable
`count === 0`, destroying the ownership branch the whole repository layer is
built on.

### 7.4 The no-op guard, server-side

**Both `update` and `updateStatus` skip the event when `previous === next`.**
Enforced once, in the chokepoint, so neither path can forget.

Today a no-op status write is harmless. With history it manufactures a
zero-duration stage, and a zero-duration stage poisons every median in §9.5 —
the most common way this happens is not a deliberate re-drag but the edit sheet:
**the user fixes a typo in `notes` and the full-row write re-sends the unchanged
status.** That path is exercised far more often than a same-column drag.

The board already guards a same-column drop client-side in `onDragEnd`. The
server does not, and a client-side guard is not a data-integrity control.

### 7.5 The fourth-path problem, and the detector

Be honest about what a chokepoint can and cannot do: **no arrangement of
TypeScript makes a fourth writer impossible.** Someone can always add a function
to `application-repository.ts` that calls `tx.application.update` directly. What
is achievable is making a bypass *loud instead of silent*, and this phase ships
three layers of that.

**Layer 1 — structural.** `prisma.application` is reachable from exactly one
module (verified, §7.1). `status` no longer appears in any public function's own
Prisma payload. A fourth writer has to be added to the one file where the
chokepoint is the most prominent thing.

**Layer 2 — the continuity invariant.** Because the chokepoint always reads its
before-image from the **live row**, a bypassed write shows up in the *next*
legitimate transition: its recorded `fromStatus` will be the status the bypass
wrote, which is not the previous row's `toStatus`. That is a contradiction in
the data, not an absence, and it is expressible as one query:

> For every application, every event's `fromStatus` equals the previous event's
> `toStatus` (ordered by `changedAt`, ties broken by `id`), and only the first
> event has `fromStatus IS NULL`.

This is a test (§15.4). It is the single reason `fromStatus` is stored rather
than derived (§6.2).

**Layer 3 — the drift check, visible in the product.** One query compares each
application's live `status` against its latest event's `toStatus`:

```ts
export function countStatusDrift(userId: string): Promise<number>
```

If they disagree, something wrote a status without recording it. This runs on
every `/analytics` render, costs one indexed query, and when the count is
non-zero the page renders a **warning band above every chart**:

> **Some figures below may be incomplete.** 2 applications have a status that
> does not match their recorded history. This means a status was changed by a
> path that does not record transitions — the numbers on this page are
> under-counting until it is fixed.

That is the answer to "miss one and the analytics are quietly wrong forever."
They are not quiet. They say so, on the page, the first time someone opens it
after the bypass. The band is not dismissible and does not appear when the count
is zero.

Note what the drift check can and cannot see: it catches a bypass that leaves
the live status different from the last recorded one — which is every bypass
that actually changed something. It cannot catch a bypass that wrote the same
status it already had, which is a no-op and has nothing to record.

### 7.6 Test fixtures that bypass the service

Fifteen sites construct applications directly via `prisma.application.create` /
`createMany`, bypassing the repository entirely:

`company-repository.test.ts:38,85` · `task-repository.test.ts:23` ·
`resume-repository.test.ts:191,214,224,338,361` ·
`quick-drop-service.test.ts:116` · `resume-service.test.ts:282,305,353,519` ·
`task-service.test.ts:39` · `company-service.test.ts:120`

Each produces an application with **zero events** — a state the running
application can never reach.

**Decision: leave all fifteen as they are, and state explicitly that "every
application has at least one event" is NOT an invariant of this schema.**

Rewriting them to go through the repository would couple twelve unrelated test
files to the application write path, so that a change to the chokepoint breaks
resume tests. They are fixtures for *other* features; their applications are
props. What matters is that nothing downstream assumes the invariant:

- Every aggregate in `analytics-repository.ts` computes its denominator from the
  event table, never from `application.count()`.
- The funnel, the conversions and the durations each state their coverage as
  "N of M applications have recorded history" (§8.4), which is the same sentence
  whether the zero-event applications are test fixtures or pre-backfill rows.
- The continuity invariant is vacuously true for an application with no events,
  which is correct.

The drift check in §7.5 does **not** fire on a zero-event application: with no
events there is no latest `toStatus` to disagree with. That is deliberate — a
zero-event application is "not recorded", not "recorded wrongly", and
conflating them would make the warning band fire on every test database.

---

## 8. Backfill

### 8.1 Exactly one synthetic row per application

Written as SQL in the same migration as the table, after the `CREATE TABLE`:

```sql
INSERT INTO "ApplicationStatusEvent"
  ("id", "userId", "applicationId", "fromStatus", "toStatus", "changedAt", "source")
SELECT
  gen_random_uuid()::text,
  a."userId",
  a."id",
  NULL,
  a."status",
  a."updatedAt",
  'BACKFILL'
FROM "Application" a
WHERE NOT EXISTS (
  SELECT 1 FROM "ApplicationStatusEvent" e WHERE e."applicationId" = a."id"
);
```

- **`fromStatus = NULL`** — it is a genesis row. Every application gets exactly
  one, and it is the only row the backfill produces.
- **`toStatus = a."status"`** — the current state, which is the only status
  fact that exists.
- **`changedAt = a."updatedAt"`** — the only timestamp available, and
  contaminated (§8.2).
- **`source = 'BACKFILL'`** — the authoritative marker. Everything in §8.3 keys
  off this column and nothing else.
- **The `NOT EXISTS` clause makes it idempotent.** Re-running writes nothing.
  Tested (§15.4), because a re-run is exactly what happens when a migration is
  applied to a database that was restored from a backup taken mid-deploy.
- **`gen_random_uuid()::text`, not a cuid.** SQL has no cuid generator. The `id`
  column is opaque — nothing in the codebase parses it, sorts on its structure,
  or infers anything from its shape — so a uuid in a cuid-defaulted column is
  legal and inert. It is *not* a marker of synthetic-ness: `source = BACKFILL`
  is, and code must never infer provenance from an id's shape. `gen_random_uuid`
  is built into Postgres 13+; no `pgcrypto` extension is required.

The backfill runs in the migration rather than as a separate script so that
there is no window in which the table exists and the existing rows have no
genesis event — a window in which the funnel would render, look plausible, and
be wrong about every pre-existing application.

### 8.2 `updatedAt` is contaminated, and this is not a caveat — it is the design constraint

`Application.updatedAt` is Prisma's `@updatedAt`. **It fires on any column
write.** Fixing a typo in a note moves it. Correcting a salary moves it.
Changing the linked resume version moves it.

So a backfilled `changedAt` is **not** "when the status last changed." It is
"when anything about this application last changed" — an *upper bound* on the
last status change, with no lower bound, and with no information whatsoever
about any earlier status the application passed through.

Three specific consequences, each of which has produced a wrong chart in
somebody's product:

1. **It is not a duration.** A single row has no predecessor and no successor,
   so it yields no interval. There is no arithmetic that turns one synthetic
   timestamp into a time-in-stage.
2. **It is not a funnel entry.** A backfilled application currently at
   `INTERVIEW` contributes a reached-`INTERVIEW` and contributes *nothing* to
   `APPLIED` or `SCREENING` — because those transitions were never recorded, not
   because they did not happen. Counting it would produce a funnel where
   `INTERVIEW > SCREENING`, a geometrically impossible shape that reads to the
   user as catastrophic drop-off. See §9.3.
3. **It is not a point on a trend line.** Twenty-three backfilled rows all
   dated within the same few days of the migration would render as a spike of
   activity on the day nothing happened.

### 8.3 What backfilled data may and may not be used for

Enforced **in query code, in one place**, not remembered:

```ts
const RECORDED_ONLY = { source: { not: "BACKFILL" } } as const
```

spread into the `where` of every duration, conversion and funnel query in
`analytics-repository.ts`, and asserted by a test per query.

| Figure | BACKFILL rows |
|---|---|
| Reached-stage funnel | **Excluded entirely** (§8.2 point 2) |
| Stage-to-stage conversion | **Excluded entirely** |
| Time in stage | **Excluded entirely** (§8.2 point 1) |
| "Moved this week" / transitions per week | **Excluded entirely** (§8.2 point 3) |
| Activity timeline | **Included, visibly marked** (§8.4, §11) |
| Coverage denominators | **Counted as "not recorded"**, and stated |
| Drift check | Included — a backfilled row is the latest event and must still match the live status |

### 8.4 How the UI distinguishes it — visibly, not silently blended

Three mechanisms, all mandatory:

**(a) One coverage banner, at the top of `/analytics`, above every figure.**

> **Status recording started on 13 Sep 2026.** 9 of your 23 applications
> existed before that. Each has a single synthetic starting point dated from
> its last edit — not from when its status actually changed — so it is
> excluded from every funnel, conversion and duration figure below. The 14
> applications with recorded history are what those figures are built from.

Not a tooltip. Not a `title` attribute. Body text in the muted token at `text-sm`,
in the same register as the resume page's paragraph, which is the standard this
phase is held to.

**(b) Every affected figure carries its own denominator, next to the number.**
A reader who scrolls past the banner still cannot misread the chart. Phrasing is
generated by one function in `analytics/format.ts` so it cannot drift:

> Based on 14 of 23 applications with recorded history.

**(c) Backfilled entries in the timeline are visually distinct and labelled.**
A dashed left rule instead of the solid stage accent, the muted text token, and
the label rendered inline:

> **Acme — Senior Engineer** · status recorded as Interview
> *Backfilled — this date is the application's last edit, not when the status
> changed.*

These never render with the "moved to" verb that recorded events use. The
timeline sorts them by `changedAt` like everything else, because there is no
better position for them, and says why the position is unreliable.

**The service makes (a) and (b) structurally hard to forget.** Every metric
`analytics-service.ts` returns is wrapped:

```ts
export type Covered<T> = {
  value: T
  /** Applications contributing recorded events to this figure. */
  recorded: number
  /** Applications in scope that have none. */
  unrecorded: number
  /** The earliest non-BACKFILL changedAt, or null before recording starts. */
  recordingStartedAt: Date | null
}
```

A component cannot render the number without destructuring past the coverage,
and `<CoverageNote>` takes a `Covered<T>` directly. The wrapper is the reason a
future figure is unlikely to ship bare.

---

## 9. The metrics — what each one can honestly say

### 9.1 The three-way classification

Every figure in this phase is one of:

| Class | Meaning |
|---|---|
| **Current-state** | Computable today from existing columns, with no history at all. Honest as long as it is labelled as a *current* state and not as a reached-stage rate. |
| **Recorded** | Computable only from non-`BACKFILL` events. Empty on the day this ships and fills in as the user works. Always carries its coverage. |
| **Approximate** | Rests on `appliedAt` (user-typed, optional) or on backfilled rows. Always carries its denominator. |
| **Not yet** | Not computable, with or without this phase. Named in §9.9 so the phase does not over-claim by omission. |

The summary table, before the detail:

| Figure | Class |
|---|---|
| Tracked / In play / Now at interview or better | Current-state |
| Pipeline distribution (7 counts) | Current-state |
| Applications **added** per week | Current-state |
| Applications **applied** per week | Approximate (`appliedAt` coverage) |
| Transitions per week ("moved") | Recorded |
| Reached-stage funnel | Recorded |
| Stage-to-stage conversion (incl. offer→accept) | Recorded |
| Time in stage (median, closed intervals) | Recorded |
| Currently-in-stage age | Current-state |
| Applications skipped ≥1 stage | Recorded |
| Per-company: applications, current stage, offers, rejected | Current-state |
| Per-company: ever reached interview | Recorded |
| Per-resume: current-state stats (existing) | Current-state |
| Per-resume: reached interview / reached offer | Recorded |
| Unlinked-application count | Current-state |
| Activity timeline | Mixed, per entry, marked |
| Days from `appliedAt` to first recorded move | Approximate |
| Response time, rejection reason, per-round conversion, source effectiveness, cross-currency salary | **Not yet** (§9.9) |

### 9.2 Dashboard (`/dashboard`)

The existing page is kept and corrected. Four changes:

**1. One relabel, which is a bug fix.** The third tile reads *"Interview or
better"*, which a reader takes as a reached-stage count. It is a current-state
count. It becomes **"Now at interview or better"** — the same fix, and the same
word, that `resume-usage.tsx` already applies to the same quantity. Once
recorded history exists, a fourth tile **"Ever reached interview"** appears
beside it, `Covered<number>`, with the coverage line underneath. Two tiles that
differ by one word and by a large number are the clearest possible teaching of
what this phase changed.

**2. One new tile: "Moved this week."** Distinct applications with a non-
`BACKFILL` event in the last 7 UTC days. Recorded-class. Before there is any
history it renders `—` with *"Nothing recorded yet — status changes start
appearing here as you move cards."* Never `0`: a zero asserts that nothing
happened, when the truth is that nothing was watching.

**3. The `groupBy` fix.** `listApplications(userId)` currently fetches every row
with its company joined, to render ten integers via nine in-memory filters.
Replaced by one `prisma.application.groupBy({ by: ["status"], where: { userId },
_count: { _all: true } })`, folded in `analytics-service.ts`. The pattern already
exists in `resume-repository.ts:220` `statsByResume`. The three tiles and the
seven strip counts all derive from that single result, with `STATUS_ORDER`
supplying the zero-filled stages `groupBy` omits — which is the one thing this
change can get wrong, and is a named test.

**4. `dashboard/loading.tsx` skeletons the Pipeline section.** It currently
skeletons only the header and three tiles, so the strip pops in unskeletoned.

The dashboard stays current-state-first. It gains one link — *"See the full
picture →"* to `/analytics` — and nothing else. It is the page opened twenty
times a day; the retrospective analysis belongs on the page opened monthly.

### 9.3 Pipeline funnel and reached-stage — `/analytics`

**Reached-stage is a set-membership question, not an event count.** For each
stage S:

> the number of **distinct** applications having at least one non-`BACKFILL`
> event with `toStatus = S`.

`SELECT COUNT(DISTINCT "applicationId") ... GROUP BY "toStatus"`. One query.

Deduplication by application is what makes backward moves harmless: drag a card
Interview → Screening → Interview and it is counted once at each stage, which is
the truth — it *reached* both.

**`REJECTED` is not in the funnel.** The funnel is the six-stage progression
`SAVED → APPLIED → SCREENING → INTERVIEW → OFFER → ACCEPTED`. `REJECTED` is
where applications land, not a stage they pass through — which is already this
codebase's stated position, in the comment above `STATUS_ACCENT` in
`status-badge.tsx` and in the dashboard strip's border separating it. It renders
as a single figure beside the funnel, labelled **"Closed — rejected"**, with its
own count of distinct applications that ever reached it.

**Two honesty properties the funnel must carry:**

**(a) Backfilled applications are excluded entirely, and the funnel says how
many.** §8.2 point 2 is the reason. The caption is §8.4(b)'s sentence.

**(b) Skipped stages are reported, not smoothed over.** A user who drags
`SAVED → INTERVIEW` directly records no `APPLIED` and no `SCREENING`. The funnel
will show `APPLIED = 0` alongside `INTERVIEW = 3`, and a reader will conclude
the data is broken. It is not — it is an accurate record of what was recorded.
So the funnel states it:

> 3 applications reached a stage without recording the ones before it. The
> funnel counts stages that were recorded, so those stages read as empty here.

Computed as: applications whose event sequence contains a transition skipping at
least one position in `STATUS_ORDER` (excluding anything into `REJECTED`, which
is a legitimate exit from any stage). One pass over the same fetched events, no
extra query.

This single line is the difference between a funnel the user trusts and one they
quietly stop opening.

### 9.4 Stage-to-stage conversion

Five figures, one per adjacent pair:

| Pair | Definition |
|---|---|
| Saved → Applied | `reached(APPLIED) / reached(SAVED)` |
| Applied → Screening | `reached(SCREENING) / reached(APPLIED)` |
| Screening → Interview | `reached(INTERVIEW) / reached(SCREENING)` |
| Interview → Offer | `reached(OFFER) / reached(INTERVIEW)` |
| **Offer → Accepted** | `reached(ACCEPTED) / reached(OFFER)` |

The last one is the payoff Phase 2 §6 split the enum for: *"Collapsing them
would permanently destroy the offer→accept conversion rate that Phase 6 wants."*
The split bought nothing until this phase; from here it does.

Three rules:

- **A zero denominator renders `—`, never `0%`.** The rule and the reasoning are
  already in this codebase, in `resume-usage.tsx`: *"a percentage over a zero
  denominator is a lie with a division sign in it."*
- **A denominator under 5 renders the raw fraction (`2 of 3`), not a
  percentage.** `67%` over three observations invites a reader to treat it as
  stable. The fraction says the same thing and cannot be misread.
- **Recorded-class, all five.** No backfilled application contributes to any
  numerator or denominator.

Rendered as a strip of five, each with its label, its figure, and a thin
proportional bar in the destination stage's hue (§10.3).

### 9.5 Time in stage

For each application, sort its non-`BACKFILL` events by `(changedAt, id)`. Each
adjacent pair `(e[n], e[n+1])` is a **closed interval** in stage `e[n].toStatus`
of duration `e[n+1].changedAt − e[n].changedAt`. The final event opens an
interval that is still running.

| Reported | From |
|---|---|
| **Median days in stage**, per stage | closed intervals only |
| **n**, per stage | the count of those intervals — always shown |
| **Currently in stage**, per application | the open interval, on the applications table, not aggregated |

**Median, not mean.** One application that sat in Screening for four months
while the user was on holiday moves a mean and does not move a median. Job
search durations are right-skewed by construction.

**Closed intervals only.** Including the open one would systematically
under-report every stage, because an application still sitting in Interview has
by definition not finished being in Interview.

**The n < 5 rule, again and for the same reason.** Below five closed intervals
the page shows the **raw sorted list of durations** (`3, 9, 14 days`) instead of
a median. At that size the observations are more honest *and* more informative
than a statistic computed from them, and a median over two numbers is an average
wearing a disguise. Above five, the median plus `n = 12` beside it.

**Backfilled applications contribute nothing at all here**, not even a partial
interval — one row has neither a predecessor nor a successor (§8.2 point 1).

Stalls and aging fall out of this and are not a separate mechanism: an
application whose open interval exceeds the median for its stage is flagged on
the analytics page's short "Oldest in stage" list, with its stage, its days, and
the median beside it for context. No thresholds are invented; the comparison is
to the user's own distribution, and the list is empty until there is a
distribution to compare to.

### 9.6 Applications over time

Three quantities that are routinely conflated and must not be:

| Chart | Source | Class | Caption |
|---|---|---|---|
| **Added per week** | `Application.createdAt` | Current-state | "When the row was created — not when you applied." |
| **Applied per week** | `Application.appliedAt` | Approximate | "14 of 23 applications have an applied date. The other 9 are not on this chart." |
| **Moved per week** | non-`BACKFILL` events | Recorded | "Status changes recorded since 13 Sep 2026." |

**Three separate single-series charts, stacked, sharing one x-axis — not one
grouped chart.** The reasons: they have *different coverage*, so each needs its
own caption directly beneath it, which a shared legend cannot provide; a single
series needs no categorical color and no legend at all; and three series across
twelve buckets is 36 bars competing for one reader's attention to make a
comparison nobody asked for. Small multiples are the right form and they are
also the cheapest to build.

**Bucketing.** Weeks beginning Monday, in **UTC**, computed on the server.
Phase 5 §7.5 settled this app's date convention at UTC midnight and recorded the
absent `User.timezone` as the known deferral; this phase inherits both, and the
axis caption says *"weeks beginning Monday (UTC)."* A user in IST will see an
application added at 04:00 local on a Monday fall in the previous week. That is
the same off-by-one Phase 5 accepted for `dueDate`, it is stated rather than
hidden, and it is fixed for both features at once whenever `User.timezone` lands.

**Range.** `?weeks=4|12|26|52`, default 12, as four `<Link>`s. Validated per
§15.1. Empty buckets render as empty, never dropped — a gap in a job search is
information.

### 9.7 Per-company outcomes

A **table, not a chart.** Choosing a form: past roughly seven classes that all
carry meaning, color stops separating them and a table is the honest
presentation. A user with twenty companies has twenty classes.

| Column | Class |
|---|---|
| Company | — |
| Applications | Current-state |
| Now at interview or better | Current-state |
| Ever reached interview | **Recorded** — `—` for applications with no history |
| Offers | Current-state |
| Rejected | Current-state |
| Last activity | Recorded, falls back to `updatedAt` **with the label "last edited"**, never "last activity" |

Sorted by application count descending, then name. Two grouped queries for the
whole table — one `groupBy` on applications, one on distinct events — never a
query per row. The pattern is `statsByResume`'s.

That last row deserves its own note: the fallback label is the difference
between a true statement and a false one, and it is exactly the error the
roadmap identified in the existing board ordering. **`updatedAt` may never be
rendered under a word that implies movement.**

This also completes the remainder of `ui-followups.md:129-133`.

### 9.8 Per-resume outcomes, and the Phase 3 caveat that must change

`ResumeStats` (`resume-repository.ts:34-39`) gains two fields:

```ts
export type ResumeStats = {
  applications: number
  atInterviewOrBeyond: number   // current-state, unchanged
  offers: number                // current-state, unchanged
  rejected: number              // current-state, unchanged
  reachedInterview: number      // recorded — distinct applications with an event toStatus INTERVIEW/OFFER/ACCEPTED
  reachedOffer: number          // recorded — distinct applications with an event toStatus OFFER/ACCEPTED
  recordedApplications: number  // the denominator for the two above
}
```

This is the payoff Phase 3 §9(a) explicitly deferred, and it is the one place
in the product where the difference between the two classes of figure is visible
side by side: *"At interview or beyond: 3 · Ever reached interview: 7"* on the
same resume is the entire argument for this phase in two numbers.

**The existing caveat paragraph at
`src/app/(app)/resumes/[id]/resume-usage.tsx:75-82` must be amended, not
deleted.** It currently ends:

> A true reached-stage rate needs status history, which this phase does not
> record.

That sentence becomes false the day this ships, and a stale honesty note is
worse than none — it teaches the reader that the notes are not maintained. The
replacement keeps the first half verbatim and corrects the second:

> These count where applications stand *now*, not every stage they reached: one
> that interviewed and was then rejected counts only under Rejected. The
> reached-stage figures beside them are the other question, and they cover only
> the 14 of 23 applications with recorded status history — the rest predate
> recording.

The `statsByResume` doc comment at `resume-repository.ts:211-216` carries the
same correction.

`countUnlinkedApplications` and the "N applications have no resume linked" line
are untouched: Phase 3 §9(b)'s rule that the totals are never quietly partial is
the same rule this phase applies to coverage.

### 9.9 Not computable, with or without this phase

Named so the phase does not over-claim by omission.

- **Anything before recording started.** The transitions that happened and were
  not written down are gone. §8.4(a)'s banner is the permanent record of the
  hole, and it names the date so it never becomes "recently".
- **Rejection versus withdrawal.** There is no `WITHDRAWN` status — cut in
  Phase 2 §3 and confirmed in roadmap §5. An application you walked away from
  and one you lost are both `REJECTED`. The rejection rate is corrupted
  independently of history, **and this phase does not fix it.** The analytics
  page says so once, beside the Closed figure, rather than silently reporting a
  rejection rate that means two different things.
- **Response time.** "How long until they got back to me" needs a
  *them*-initiated event. The closest proxy is `appliedAt` → first recorded
  move, which is reported as exactly that, for applications having both, with
  the denominator — and captioned with what it actually measures: *"days from
  your applied date to your first status change. That is when you moved the
  card, not when they replied."*
- **Per-interview-round conversion.** No rounds model (Phase 2 §3, "their own
  subsystem"). `INTERVIEW` is one stage whether it was one call or five.
- **Source effectiveness.** §3. A raw counted list of `source` values as typed,
  under the heading *"Sources, as you typed them"*, with no rates and no chart.
- **Cross-currency salary.** §3. Grouped by currency string, each group with its
  own n, or nothing.
- **Time in a stage entered before recording started**, including for
  applications that are *currently* in such a stage — their open interval starts
  at an unknown instant, so they are excluded from the "Oldest in stage" list
  too, not shown with a wrong age.

---

## 10. Charting

### 10.1 The decision: no dependency

**No charting library is added. The charts are CSS boxes in Server Components.**

The honest way to make this call is to name the chart types first and price the
library against them, rather than reaching for one by reflex.

**What actually has to be drawn:**

| Figure | Geometry |
|---|---|
| Reached-stage funnel | 6 horizontal bars, descending, each width = count / max |
| Conversion strip | 5 proportional bars on a neutral track |
| Applications over time (×3) | 12–52 vertical columns, single series, height = count / max |
| Time in stage | 7 horizontal bars of a median, plus a text n |
| Stat tiles | no geometry — a number and a label |
| Per-company / per-resume | `<table>` |

**Every one is a rectangle whose length is proportional to a number.** Not one
needs a scale function, a path generator, an axis renderer, a layout algorithm,
or an interpolator. `width: 62%` on a div is the entire implementation, and the
browser's layout engine is a more reliable proportional-length renderer than any
JavaScript that computes pixel widths.

**What a library would cost, specifically:**

- **Bundle.** Recharts pulls `d3-scale`, `d3-shape`, `d3-array` and its own
  component tree — comfortably over 100 KB gzipped for a page opened monthly.
  Lighter options (`chart.js`, `uplot`) still add 20–50 KB and a canvas element
  that is invisible to text selection, to Cmd-F, and to a screen reader without
  a hand-written table twin *anyway*.
- **The architectural cost, which is larger than the bundle.** Every charting
  library in this ecosystem is client-only. Adopting one turns `/analytics` —
  currently a pure Server Component computing aggregates next to the database —
  into a page that serialises its aggregates into props, ships them plus a
  renderer to the browser, and hydrates. For arithmetic the server already did.
  It would be the first page in this app to render its primary content on the
  client.
- **The dependency cost.** 21 production dependencies today, with
  `next-auth@5.0.0-beta.32` already the one whose breakage would be worst, and —
  per roadmap §4, Phase 8 — **nothing watching for advisories against any of
  them.** Adding a transitive tree of a dozen packages to draw rectangles, into
  a project with no dependency scanning, is a poor trade.

**What is given up, named rather than glossed:** hover tooltips, animated
transitions, zoom/brush, and automatic axis tick selection. §10.4 covers the
first with direct labels and a table twin, and the rest are not wanted — a
monthly retrospective does not need an animated funnel.

**The rule this follows:** a funnel and a bar chart do not need a library. If a
future phase genuinely needs a form that CSS cannot express — a line chart with
a crosshair, a scatter with a Voronoi hit layer — that phase makes its own
decision with its own evidence. This one does not pre-pay for it.

### 10.2 What each chart is made of

- **Funnel.** A `<ul>`, one `<li>` per stage, each a label, a count, and a
  `<div>` whose `width` is `count / max` as a percentage. **Descending
  horizontal bars, not a tapered trapezoid.** A trapezoid encodes value as area
  while the reader compares lengths, and the two disagree; the taper is decoration
  that distorts. 4px rounded data-ends, anchored to the left baseline. A 2px gap
  between bars, formed by the surface showing through, **not by a border drawn
  around each bar.**
- **Conversion strip.** Five small groups: label, figure, and a 2px-tall track
  with a filled portion. Thin marks, not blocks.
- **Weekly columns.** A flex row of `<div>`s with `height` percentages against a
  fixed plot height, plus an x-axis band **inside** the container's height — a
  fixed height that excludes the axis is what produces a card with a tiny nested
  scrollbar.
- **Stage durations.** Same primitive as the funnel, one bar per stage, scaled
  to the longest median.
- **Stat tiles.** The existing dashboard tile markup, lifted into
  `analytics/stat-tiles.tsx` and reused by both pages so they cannot diverge.
  Label in the muted uppercase 11px token, value at `text-2xl` in **proportional
  figures, not `tabular-nums`** — equal-width digits make a large standalone
  number look loose. `tabular-nums` stays where numbers align vertically: table
  columns and axis ticks.

Recessive chrome throughout: hairline solid grid and axis rules one shade off
the surface, never dashed — a dashed rule reads as a threshold or a projection
when it is just a grid.

### 10.3 Color

**No new color tokens.** `globals.css` already defines seven stage hues
(`--stage-saved` … `--stage-rejected`) in both themes, plus `--chart-1` …
`--chart-5` aliased onto five of them.

**The funnel and the conversion bars use the stage hues, via the existing
`STATUS_ACCENT` map** — the same hue for the same stage as the board rules, the
status lozenges and the dashboard strip. The generic guidance for an *ordered*
category scale is a single-hue ordinal ramp; it is set aside here deliberately,
because stage identity is already an established encoding in this product and a
funnel painted in a ramp would be the only surface where Interview is not the
Interview color. Consistency with an existing system beats a generic default,
and the stage palette *is* this product's status palette.

**The three weekly column charts are single-series**, so they need no
categorical scale at all: one hue, `--chart-1` (the applied blue), on all three.
A single series needs no legend — the chart title names it.

**Identity is never carried by color alone.** Every funnel bar, every conversion
figure and every duration bar is directly text-labelled with its stage name and
its value. Nothing on this page requires distinguishing two hues to read it,
which is also what makes the absence of a legend correct rather than a lapse.

Adjacent bars are separated by a 2px surface gap, not by a border.

No new hue is introduced, so the palette inherits the contrast work already done
— including the deliberate, documented dark-mode `SAVED` lozenge deviation,
which any future token sync must preserve (roadmap §4, Phase 8).

### 10.4 Accessibility, and the table-view twin

- **Every chart has a table twin.** Each section ends with a native
  `<details><summary>Show the numbers</summary><table>…</table></details>`.
  Native disclosure: keyboard-operable, announced correctly, and **zero
  JavaScript**, which is what lets the page stay a pure Server Component.
- **Every value is reachable without hover.** There are no tooltips on this
  page, and there is nothing behind one — the funnel, conversion and duration
  bars are all directly labelled, and the 12–52 weekly columns label their
  maximum and their most recent bar only (a number on every column is chaos and
  goes unread) with the rest in the table twin.
- **Charts are `<figure>` with a `<figcaption>`** carrying the title and the
  coverage sentence, so the caption is part of the figure's accessible name and
  is never read in isolation from the number.
- **Purely decorative rules** (the thin stage accent above a tile) are
  `aria-hidden`, as the dashboard strip already does.
- **Dark mode is inherited, not flipped.** Both themes' stage values are already
  authored and measured.
- The skip-link and sidebar-landmark gaps are Phase 8's and are untouched; this
  phase adds no new landmark and no new focus trap.

---

## 11. The activity timeline

### 11.1 Sources — five, and the three that are deliberately absent

| Source | Timestamp | Renders as |
|---|---|---|
| `ApplicationStatusEvent` (recorded) | `changedAt` | "Moved **Acme — Senior Engineer** to Interview" |
| `ApplicationStatusEvent` (`BACKFILL`) | `changedAt` | "**Acme — Senior Engineer** status recorded as Interview" + the §8.4(c) marker |
| `Application` | `createdAt` | "Added **Acme — Senior Engineer**" |
| `Task` | `completedAt` (non-null) | "Completed **Send follow-up to Acme**" |
| `Document` | `createdAt` | "Filed **Acme offer letter**" |
| `ResumeVersion` | `createdAt` | "Uploaded **Backend SWE — v3**" |

`Application.createdAt` is included and is not redundant with the genesis event:
without it, an application created before recording started and never moved
since would never appear in the timeline at all.

**Deliberately absent:**

- **`Credential`** — Phase 5 §9.8 is unambiguous: never logged, never in an
  error message, never in a URL. A feed entry reading *"Added credential:
  Workday — acme.com"* is a disclosure surface built on top of a feature whose
  whole design is about not having one. Not in the timeline, not now, not as an
  option.
- **`QuickDropItem`** — by design transient (Phase 5 §4.1: "an inbox whose items
  never leave stops being an inbox"). A captured line and its conversion into a
  task would produce two entries for one thought.
- **`Link`** — a bookmark is not an event.
- **Any `updatedAt`, anywhere.** It is not an event; it is the fact that a row
  was touched. Rendering it in a feed is the same category error as labelling the
  board "most recently moved."

### 11.2 Assembly

Five scoped queries, each `where: { userId, <ts>: { lt: cursor } }`,
`orderBy: { <ts>: "desc" }`, `take: pageSize + 1`, `select`ing only the columns
the row renders. Merged in memory, sorted by
`(timestamp desc, sourceRank asc, id asc)`, sliced to `pageSize`.

Bounded by construction: to fill a page of N you never need more than N + 1 from
any single source, so the work is `5 × (N + 1)` rows regardless of table size.
No `UNION ALL` raw query — five typed Prisma queries keep the ownership filter a
top-level scalar on each (§5.1), which a hand-written union would put at the
mercy of one forgotten `WHERE`.

**Cursor: `?before=<ISO instant>`**, taken from the last rendered entry.
`sourceRank` makes the sort a **total order** so paging is deterministic. The
residual: two entries sharing an identical millisecond could straddle a page
boundary. Rather than pretend it cannot happen — the backfill can date many rows
from one migration run — the feed **de-duplicates on render by the composite key
`${source}:${id}`** against the ids already shown. Cheap, and it makes the
failure mode "an entry appears once" instead of "an entry silently vanishes."

### 11.3 Where it lives

- **`/analytics`** ends with **Recent activity**: the latest 20 entries, and a
  *"See all activity →"* link.
- **`/analytics/activity`** is the full paginated feed, `?before=` cursor,
  50 per page, with an *"Earlier"* link at the foot.

One nav entry, two routes. The full feed is nested under `/analytics` rather
than given its own top-level entry because the sidebar already carries eleven
items across two groups, and a paginated chronological browse is a different
reading mode from a set of aggregates — putting it *inside* the analytics page
would make paging re-render every chart.

Entries are grouped under UTC day headings using `formatDate` from
`../resumes/format` (the established ISO-date helper — a locale-formatted date
renders differently on server and client and trips hydration). Each entry links
to its subject. Empty state: the shared `EmptyState`, not a blank list.

---

## 12. Pages & flows

### `/analytics`

Server Component. One `auth()`, one `redirect("/login")` when absent, then one
`Promise.all` of the aggregate queries.

Order on the page, which is the order of trustworthiness:

1. **`PageHeader`** — "Analytics", description *"How your search has actually
   gone."*
2. **The drift band** (§7.5), only when the drift count is non-zero.
3. **The coverage banner** (§8.4a), always, until every application has recorded
   history.
4. **Stat tiles** — Tracked · Now at interview or better · Ever reached
   interview · Moved this week.
5. **Pipeline funnel** + Closed figure + the skipped-stage line (§9.3).
6. **Conversion strip** (§9.4).
7. **Time in stage** + Oldest in stage (§9.5).
8. **Over time** — the three column charts and the range links (§9.6).
9. **By company** (§9.7).
10. **By resume** (§9.8).
11. **Sources, as you typed them** (§9.9).
12. **Recent activity** (§11.3).

**Empty state.** With zero applications the page shows one `EmptyState` and
nothing else — not eleven empty sections. With applications but no recorded
history it shows the current-state figures, the coverage banner, and each
recorded section rendered as its own small empty note (*"Nothing recorded yet"*)
rather than as a zero. **A zero is a claim; this page does not make claims it
cannot support.**

### `/analytics/activity`

`PageHeader` "Activity", a back link to `/analytics`, the day-grouped feed, an
*"Earlier"* link. Empty state when there is nothing.

### `/dashboard`

Per §9.2.

---

## 13. Navigation

`src/config/site.ts` gains one entry, at the end of the `Career` group:

```ts
{ title: "Analytics", href: "/analytics", icon: ChartColumn, group: "Career" },
```

`ChartColumn` from `lucide-react` (`BarChart3` is the legacy alias for the same
glyph). The sidebar reads this array as data, as Phase 1 designed it, so that is
the whole navigation change. `/analytics/activity` gets no entry — it is reached
from the page above it, the same way `/companies/[id]` is.

---

## 14. Route protection

`src/proxy.ts` already protects the `(app)` group; both new routes are inside it
and need no change. Each page still calls `auth()` itself and redirects when
there is no session — the proxy is the outer gate, not the only one, matching
every page shipped since Phase 2.

No new API route. No new file-serving path. Nothing in this phase serves bytes.

---

## 15. Cross-cutting concerns

### 15.1 Validation

This phase adds no Server Action, so the id-validation rule has no new instance
to apply. It has a close relative that does apply.

**Every `searchParams` value is parsed with Zod before it reaches a Prisma
`where`.** `src/server/validators/analytics-schemas.ts`:

```ts
export const analyticsRangeSchema = z.object({
  weeks: z.coerce.number().int().refine((n) => [4, 12, 26, 52].includes(n)).catch(12),
})

export const activityCursorSchema = z.object({
  before: z
    .string()
    .trim()
    .refine((value) => !hasControlChars(value), "Invalid cursor")
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), "Invalid cursor")
    .optional(),
})
```

Why this is not ceremony: `?before=garbage` passed through `new Date()` is
`Invalid Date`, and Prisma rejects an invalid Date with a driver-level error —
a 500 on a crafted URL. And `?before[gt]=` arrives as an **object**, not a
string; an unvalidated object reaching a Prisma `where` is the same shape of bug
that turned one delete into a mass delete in `documents/actions.ts` and was
fixed in `fe47c55`. `requiredId`'s doc comment in `limits.ts` records that
lesson; this is the same lesson on a read path. `hasControlChars` is reused from
`limits.ts` for the same reason it exists there — Postgres `text` refuses a NUL
byte outright, as a driver error rather than a non-match.

**A bad value falls back to the default; it never throws.** A malformed URL
renders the default view, not an error page. `weeks` uses `.catch(12)` for
exactly that. `before` falls back to `undefined`, which means "the first page".

**Zod 4 rules observed:** `.optional()` is the **outermost** wrapper on every
optional field above — transform-after-optional yields required keys. Nothing
here takes a URL, so the http/https restriction has no instance this phase.

**The `undefined` trap.** The one write in this phase is the event insert, and
`fromStatus` on a genesis row is written as explicit `null`, never left
`undefined`. On a `create` Prisma treats both as NULL today, so this changes
nothing at runtime — it is written explicitly because the codebase's convention
is `?? null` everywhere a nullable column is set (`application-repository.ts:44`,
`task-repository.ts`, `resume-repository.ts`), and a field that is `undefined`
in one shape and `null` in another is how the trap gets re-sprung later.

### 15.2 Error handling

Read-only pages, so there is no `ActionResult` surface to add. Three cases:

- **No session** → `redirect("/login")`, before any query.
- **A query throws** → the route-level `error.tsx`. There is none at any level
  today (roadmap §4, Phase 7); this phase does not add one, and that is recorded
  rather than silently accepted: until Phase 7 lands, a failed analytics query
  shows Next's bare shell.
- **`P2034` inside the chokepoint** → retried once, then surfaced as the
  existing generic *"Something went wrong. Please try again."* from
  `applications/actions.ts`. **No new error class**: a serialization retry
  exhausting itself is not a distinct user-facing condition, and inventing a
  message for it would leak database mechanics into the UI.

Errors never carry an event id, an application id or a user id into a message —
Phase 5 §9.8's rule, applied generally.

### 15.3 Loading states

- `analytics/loading.tsx` skeletons the header, the four tiles, the funnel's six
  bars and the three chart cards — **every section that renders**, not a subset.
  The existing `dashboard/loading.tsx` omits the Pipeline strip and that is the
  bug being fixed in the same phase; repeating it here would be careless.
- `analytics/activity/loading.tsx` skeletons the header and ten feed rows.
- No skeleton flash on navigation between range links: the `<Link>`s are
  ordinary navigations within the same route, so Next holds the previous render.

### 15.4 Testing

Vitest, `environment: "node"`, integration against `DATABASE_URL` like the other
12 DB-touching files. Per-file cleanup by user, as the existing repository tests
do.

**The recorder — `application-repository.test.ts`:**

| Test | Asserts |
|---|---|
| create with `SAVED` | one event, `fromStatus: null`, `toStatus: SAVED`, `source: CREATE` |
| **create with `INTERVIEW`** | genesis `toStatus` is `INTERVIEW`, **not** `SAVED` — §6.3 |
| `updateStatus` | one event, `fromStatus` = the prior status, `source: BOARD_DRAG` |
| **`update` with a changed status** | one event, `source: EDIT_FORM` — §7.1 path 3, the one that silently breaks the funnel |
| **`update` changing only `notes`** | **no new event** — §7.4, the common no-op |
| `updateStatus` to the same status | no new event |
| `updateStatus` on another user's application | returns null, writes **no** event, and leaves the target's status unchanged |
| `update` on another user's application | same |
| a sequence of six transitions | six events, `fromStatus[n] === toStatus[n-1]` throughout |
| **the continuity invariant** | over every application in the fixture: exactly one `fromStatus IS NULL`, first by `(changedAt, id)`, and every subsequent `fromStatus` equals its predecessor's `toStatus` — §7.5 layer 2 |
| **the drift detector** | mutate a status with a direct `prisma.application.update`, simulating a fourth path; `countStatusDrift` returns 1 — §7.5 layer 3 |
| **the export tripwire** | `Object.keys(applicationRepository).sort()` equals a frozen literal list. A new export fails the test, whose comment points the author at §7.2. Cheap; catches the one thing a type system cannot. |

Atomicity is asserted behaviourally through the two cross-tenant rows above
(neither write lands) and structurally by there being exactly one
`prisma.$transaction` on the path. Inducing a mid-transaction failure to prove
rollback would need a fault-injection harness, and that is not worth building at
this size — stated rather than quietly skipped.

**The backfill:**

| Test | Asserts |
|---|---|
| against seeded applications | exactly one row each, `fromStatus: null`, `toStatus` = current status, `changedAt` = `updatedAt`, `source: BACKFILL` |
| **run twice** | still exactly one row each — the `NOT EXISTS` clause |
| against an application that already has a recorded event | writes nothing |

Run via `$executeRawUnsafe` with the migration's own statement text, so the test
exercises the shipped SQL rather than a paraphrase of it.

**The aggregates — `analytics-repository.test.ts`:**

- Every recorded-class query **excludes `BACKFILL`** — one test per query, each
  seeding one backfilled and one recorded application and asserting the
  backfilled one contributes zero.
- Reached-stage deduplicates: Interview → Screening → Interview counts once at
  each.
- Zero denominator returns `null`, not `0` (rendered as `—`).
- `n < 5` returns the raw duration list, not a median; `n >= 5` returns the median.
- Medians use closed intervals only; the open one is excluded.
- Weekly bucketing at a month boundary, a year boundary, and across a DST
  transition in a non-UTC local zone — the buckets must not move.
- `groupBy` zero-fill: a status with no applications appears with count 0 in
  `STATUS_ORDER` position.
- **Cross-tenant**: every aggregate, seeded with two users, returns only the
  caller's numbers. This is the test that matters most in this file — §5.1's
  point is that a dropped filter here is a wrong chart, not a visible leak.

**The timeline — `status-event-repository.test.ts` / `analytics-service.test.ts`:**

- Merge order across all five sources with interleaved timestamps.
- Cursor paging: page 2 starts where page 1 ended, with no gap.
- Two entries at an identical millisecond straddling a boundary appear exactly
  once across the two pages (the composite de-dup).
- A task with `completedAt: null` never appears.
- **No `Credential` row ever appears**, asserted by seeding one and asserting
  its label is absent from every rendered entry — §11.1.
- Backfilled entries carry the marker flag.

**Pure functions — `analytics/format.test.ts`:** week bucketing, median,
n-threshold phrasing, coverage-sentence generation. No database, fast.

**E2E — `e2e/applications.spec.ts` gains one case:** drag a card on the board,
open `/analytics`, assert the funnel shows the new reached stage. One test that
proves the whole chain, board to chart, through the real UI.

---

## 16. Migration and operational notes

1. Edit `prisma/schema.prisma`.
2. `pnpm exec prisma migrate dev --name add_application_status_event` — **never
   `pnpm dlx`**.
3. Append the §8.1 backfill INSERT to the generated `migration.sql` **before**
   applying it anywhere but the dev database, so the table never exists without
   the genesis rows.
4. **`pnpm exec prisma generate`, explicitly.** `migrate dev` does not reliably
   do it in this repo, and a stale client makes
   `prisma.applicationStatusEvent` `undefined` at runtime while the types still
   compile — which presents as a null-reference in the chokepoint, not as a
   Prisma error.
5. **Restart the dev server.** Node caches `node_modules`; a running server
   keeps the stale client from step 4 and will reproduce the same symptom after
   a correct `generate`.
6. `pnpm lint && pnpm exec tsc --noEmit && pnpm test` before the commit. Phase
   2's own process lesson — a real defect surviving six tasks because lint ran
   once — is still enforced by nothing but memory until CI lands in Phase 7.

**Migration-ordering note.** Phases 4 and 5 have merged, so `prisma/migrations/`
has a single stream and this is the only open migration. The roadmap's
three-concurrent-workflows hazard no longer applies.

**`prisma migrate deploy` is still wired into no deploy path** (roadmap §4,
Phase 7). This migration has a data step, which makes that gap slightly sharper:
it must run exactly once, in order, before the new code serves traffic. Recorded
here, owned by Phase 7.

---

## 17. Spec self-review notes

- **Placeholder scan:** none remain. Every model, column, enum member, cascade
  rule, index, isolation level, route, search param, chart primitive, color
  token and test case above is concrete. The three numbers chosen by judgement
  rather than derivation state their reasoning inline: the `n < 5` threshold for
  showing raw observations instead of a median and a percentage (§9.4, §9.5),
  the 20/50 page sizes for the activity feed (§11.3), and the default 12-week
  range (§9.6).

- **The prerequisite is shipped first, and the seam is explicit.** §6–§8 are the
  recorder and stand alone: they could be merged, deployed and left running for
  weeks with no chart in sight, which is exactly the roadmap §3 argument for
  doing so. §9 onward is the analytics. The split point is between §8 and §9 and
  nowhere else — splitting inside §9 would mean building the coverage machinery
  twice.

- **Internal consistency.** §6.2's stored `fromStatus` is what §7.5 layer 2's
  invariant checks and what §15.4's continuity test asserts. §6.4's `Cascade` is
  what §9.3's retroactive-recomputation caveat is about. §7.2's single INSERT
  site matches §7.2's "`status-event-repository.ts` exports no write function"
  and §6's "append-only" comment. §7.4's no-op guard is what §8.2's zero-duration
  warning and §15.4's notes-only-edit test are about. §8.3's `RECORDED_ONLY`
  constant is what §9.3, §9.4, §9.5 and §9.6's "Recorded" classifications all
  resolve to, and §15.4 has one exclusion test per query. §8.4's `Covered<T>`
  wrapper is what §9.2's and §9.8's coverage lines render from. §10.1's "no
  client JS" matches §10.4's native `<details>`, §12's Server Components, and
  §4's zero dependencies. §11.1's exclusion of `Credential` matches Phase 5
  §9.8. §9.6's UTC weeks match Phase 5 §7.5's UTC-midnight convention and cite
  the same deferred `User.timezone`. Checked and consistent.

- **Ambiguity check.** The places a reader could reasonably ask "which did you
  mean" are each resolved explicitly:
  (a) per-transition or per-entry rows — §6.1, per-transition, with the
  append-only argument and the cost accepted;
  (b) whether `fromStatus` is stored or derived — §6.2, stored, because
  derivation makes a missed write undetectable;
  (c) what the genesis row's `fromStatus` is — §6.2, `NULL`, and why `SAVED` and
  self-reference are both wrong;
  (d) whether the genesis `toStatus` can be assumed `SAVED` — §6.3, no;
  (e) whether deleting an application deletes its history — §6.4, yes, with the
  retroactive-recomputation cost stated rather than hidden;
  (f) where the event is written — §7.2, the repository chokepoint, with the
  four rejected locations;
  (g) what happens on two concurrent status writes — §7.3, `Serializable` with
  one retry, and why compare-and-set was rejected;
  (h) whether backfilled rows appear in the funnel — §8.3, no, and §8.2 point 2
  gives the impossible-shape reason;
  (i) whether "interview rate" means reached or currently-at — §9.8, **both are
  shown, side by side, labelled**, which is the point of the phase;
  (j) whether a library is added — §10.1, no, priced against the actual
  geometry;
  (k) whether the timeline is its own nav entry — §11.3, no.

- **The honesty standard is met by mechanism, not by intention.** The claim
  "a metric that rests on one synthetic row says so in the UI" is backed by four
  structural things rather than by discipline: the `Covered<T>` wrapper (§8.4)
  that a component cannot render past without seeing the coverage; the
  `RECORDED_ONLY` constant (§8.3) with a per-query exclusion test; the
  always-present coverage banner (§8.4a); and the drift band (§7.5) that turns
  the one failure this feature actually has into a visible warning. The existing
  `resume-usage.tsx` caveat is not just cited as the standard — §9.8 **amends
  it**, because a stale honesty note is worse than none.

- **Security review.** The phase adds no Server Action, no API route, no file
  path, no client-supplied foreign id, and no new secret. Its two surfaces are
  (a) aggregate ownership, answered by a denormalised `userId` in every
  top-level `where` (§5.1) and a cross-tenant test on **every** aggregate
  (§15.4) — the emphasis is deliberate, because a dropped filter on a `groupBy`
  is a wrong number rather than a visible leak; and (b) unvalidated
  `searchParams` reaching a Prisma `where`, answered by §15.1 with the same
  object-not-string lesson that `fe47c55` recorded on the write side. One
  disclosure risk is refused outright: `Credential` never appears in the
  timeline (§11.1).

- **Scope check, honestly.** Larger than Phase 2, smaller than Phase 5. One
  model, one migration with a data step, three modified repository functions,
  two new routes, eleven page sections. **One plan with one natural split at the
  §8/§9 seam**, which is also the split the roadmap recommends for delivery
  order. Two things were cut *to keep it one plan* and both are named in §3 with
  reasons rather than left to be discovered: table sorting (the roadmap's
  rationale for homing it here does not survive contact with the actual query
  changes) and resume-skill A/B (refused on sample size, not difficulty).

- **What this phase knowingly does not fix.**
  - **The hole before today is permanent.** No design recovers a transition that
    was never written down. §8.4(a)'s banner names the start date so the hole
    stays visible instead of aging into invisibility.
  - **`REJECTED` still means two things** — lost and walked away. Cut in Phase 2
    §3; history does not fix it; §9.9 says so beside the figure.
  - **`updatedAt` remains the board's ordering** and remains a small lie. Now
    fixable and deliberately not fixed (§3), because the cure moves cards under
    the user's cursor.
  - **Fifteen test fixtures still create applications with zero events**
    (§7.6). Left alone, with "every application has at least one event" recorded
    as **not** an invariant, and every denominator computed so that it does not
    matter.

- **Known deferrals, recorded not discovered:**
  - **`User.timezone`** (§9.6) — the shared fix for this phase's week buckets
    and Phase 5's `dueDate`. Neither is correct for a non-UTC user until it
    lands; both say so.
  - **`error.tsx` at any level** (§15.2) → Phase 7. Until then a failed
    aggregate shows Next's bare shell.
  - **`prisma migrate deploy` in a deploy path** (§16) → Phase 7, made slightly
    sharper by this migration carrying a data step.
  - **Resume-skill A/B** (§3) → revisit at a few hundred applications, when the
    cells stop being single-digit.
  - **Table sorting** (§3) → whoever next opens `application-table.tsx`;
    `README.md:11` stays wrong until then.
  - **A charting dependency** (§10.1) → whichever future phase needs a form CSS
    cannot express, with its own evidence. This phase does not pre-pay for it.
  - **Component/DOM tests** — the charts are the most layout-sensitive markup in
    the repo and `vitest.config.ts` is still `environment: "node"` with no
    `.test.tsx` anywhere (roadmap §4, Phase 8). §15.4 tests the arithmetic and
    the E2E case tests the chain; the rendering itself is covered by neither.

# ManageMe — Roadmap for the remaining work

**Date:** 2026-09-13
**Status:** Decided. Supersedes the phase list in
`docs/superpowers/specs/2026-08-24-phase1-foundation-design.md` §1 wherever the
two disagree.
**Baseline:** `main` at `2e85b0d`. Phase 4 and Phase 5 implementation is in
flight in a separate workflow as this is written, so the working tree also
carries their first uncommitted edits (`prisma/schema.prisma`,
`src/config/site.ts`, `src/proxy.ts`, `.env.example`). Nothing below counts
those as shipped.

The original seven-phase plan was written in August, before a line of code
existed. Five phases of reality have since changed two of its assumptions
materially and several of its details. This document says what the remaining
plan is now, what it replaces, and where every outstanding item lives. It is a
decision document: where the evidence supports a call, the call is made here.

---

## 1. Where the project actually stands

| Phase | Status | Where it actually is |
|---|---|---|
| **1 — Foundation** | Complete | Auth (argon2id credentials, edge-split `auth.config.ts`), `/login` `/signup` `/settings`, app shell, `src/proxy.ts` route protection, theme. Declared non-goals (Google OAuth, password reset) still absent, as intended. |
| **2 — Core career** | Complete, one gap | Companies, Applications, the 7-stage enum, dnd-kit board, table, status filter. **Gap:** the spec §7 promised a table sortable by company/role/status/applied date; only filtering shipped. `README.md:11` still advertises "a sortable table" and is wrong. |
| **3 — Resume system** | Complete | Slots, versions, skills, projects, the storage abstraction, the authorising file route, usage analytics. Heaviest tested area in the repo (173 of 301 Vitest blocks). **Caveat:** unlike 1 and 2, Phase 3 has a design spec but no implementation plan in `docs/superpowers/plans/`. |
| **4 — Documents** | Spec committed (`f0f1b36`), zero code | 1640-line spec through a self-review. No `/documents` route, no `Document` model, no migration, no nav entry. In flight in a separate workflow. |
| **5 — Productivity** | Spec committed (`2e85b0d`), zero code | Projects, Tasks, Links, QuickDrop, Credentials. Spec states Phase 5 is independent of Phase 4 and can ship in any order relative to it. In flight in a separate workflow. |
| **6 — Analytics** | Not started, and **blocked** | No analytics route, no aggregate service, no charting dependency, no event table. The dashboard already renders point-in-time tiles (see §2.3). Blocked on §2.1. |
| **7 — Production hardening** | Not started — genuinely empty | No CI, no Dockerfile, no platform config, no cloud storage driver, no security headers, no rate limiting, no observability, no error boundary. Not "partly done": none of it exists. |

**Current shape:** 6 Prisma models (`User`, `Company`, `Application`, `Resume`,
`ResumeVersion`, `ResumeProject`), 2 enums, 4 applied migrations, 12 routes,
21 test files (18 Vitest / 3 Playwright, 301 `it()` blocks and 8 e2e tests),
21 production dependencies. Live data in the configured database: 3 users,
3 companies, 3 applications, 4 resumes, 2 resume versions — one day old.
52 real uploaded files under `.uploads/` across 8 user prefixes.

---

## 2. What changed about the plan, and why

### 2.1 Phase 6 has a hard prerequisite that the original plan did not contain, and it cannot be backfilled

The original plan listed Phase 6 as "dashboard widgets, career analytics,
activity timeline" — three deliverables, one phase, no prerequisites. That was
wrong in a way that only becomes visible once there is data.

**The gap is total.** Nothing in the schema records a status transition. There
is no history table, no event table, no `statusChangedAt`, no `enteredStageAt`,
in any of the 6 models or any of the 4 migrations. The three timestamps that do
exist are each the wrong thing:

- `Application.createdAt` — when the *row* was made. The create form carries a
  full 7-option status select (`application-sheet.tsx:184-196`), so a row can be
  created directly as `INTERVIEW` and its `createdAt` says nothing about the
  funnel.
- `Application.updatedAt` — Prisma's `@updatedAt` fires on *any* column write.
  Fixing a typo in a note moves it. It is not "last status change" and must
  never be labelled as such. `applicationRepository.listByUser` already orders
  the board and table by `updatedAt desc`, so "most recently moved" is already
  a small lie in the shipped UI.
- `Application.appliedAt` — the only genuine event date, but user-typed,
  optional, and covering exactly one transition.

**What this makes impossible:** every reached-stage count ("how many ever
reached Interview" — a row that interviewed then got rejected is byte-for-byte
identical to one rejected after a screen); all four stage-to-stage conversions;
all time-in-stage and velocity metrics; aging and stall detection; every trend
line except applications *created* per week; drop-off diagnosis; resume A/B on
reached-stage; backward moves; and the activity timeline, which has no source in
any model, present or landing.

The sharpest consequence: Phase 2 deliberately split `ACCEPTED` from `OFFER` to
"preserve the offer→accept conversion rate that Phase 6 wants"
(phase2 spec :224). Without history that split bought nothing — an `ACCEPTED`
row carries no evidence it was ever `OFFER`.

**Why it cannot wait for Phase 6.** This is the only gap in the project that is
not fixable later from what is already stored. A transition that happened and
was not written down is gone. Backfill can synthesise at most one row per
application — `(toStatus = current, changedAt = updatedAt, source = BACKFILL)` —
and even that is contaminated, because `updatedAt` moved the last time the user
edited a note. The window closes silently: no error, no warning, no degraded
mode. You find out the day you open the funnel chart and it is built on six
weeks of nothing.

**Cost of waiting, measured rather than asserted: today, essentially nothing.**
Three applications, one day old. Anyone calling this an emergency right now is
arguing past the data. The argument is the asymmetry, not the loss so far —
the table is one additive model with no backfill and three write sites in one
file, it gets no cheaper by waiting, and the data it captures is the only
uniquely unrecoverable thing here. At single-user scale (40–120 applications
over 3–6 months, 2–5 transitions each) performance is a permanent non-issue,
but the *sample* is the problem: you cannot compute a median days-in-screening
from six observations, and the cohort lost to delay is systematically the early
one.

**So the requirement Phase 6 actually has is that recording started weeks before
Phase 6 ships — and Phase 6 cannot satisfy its own prerequisite.** That is why
§3 splits it out. The precedent is one model over, in the Phase 5 spec landing
this week: `Task.completedAt` exists, service-owned, explicitly because
"`updatedAt` cannot answer 'what did I finish last week'". Same author, same
week, same reasoning, applied correctly to Task and not to Application.

### 2.2 Phase 7 is no longer an abstract line item — it is an enumerated backlog, and it is bigger than one phase

The original plan gave Phase 7 six words: "security, testing, accessibility,
performance, observability, deployment". Five phases of code review have turned
that into roughly 35 concrete items with file paths. Three things about the
shape of it change the plan:

**(a) The application-level security is largely sound; everything at and around
the boundary is missing.** Worth not re-litigating: the file-serving path is
excellent and fully tested (one authorising route, no key-accepting endpoint,
nothing statically served, 404-never-401, server-chosen literal Content-Type
plus nosniff, generated-not-interpolated `Content-Disposition` with
CRLF/quote/non-ASCII/traversal unit tests); storage-key traversal has three
independent gates; the ownership rule is enforced at the repository layer with
cross-tenant tests; write ordering is reasoned and consistent across two
phases; TypeScript is strict. What is missing is the perimeter — no security
headers *at all* (`next.config.ts` has no `headers()`), no rate limiting on an
argon2id login, no session revocation — and the entire operational surround: no
CI, no image, no deploy config, no cloud storage, no logging, no error
boundaries, no health check, no GC, no quotas.

**(b) There is a dependency chain, so "Phase 7" cannot be attacked in any
order.** The storage driver decides the host; the host decides the body-size
ceiling and the header mechanism; the CI shape depends on the host. That is a
sequence, not a checklist.

**(c) One item is free and blocks nothing.** The `jwt` callback in
`src/lib/auth/auth.config.ts:8-17` does `if (user) token.sub = user.id` and
nothing else. One database lookup there fixes two separate recorded bugs — a
session outliving a deleted user (hit for real on 2026-09-12), and a password
change that does not invalidate outstanding sessions (a stolen JWT stays valid
for up to 30 more days). Highest value-per-line item on the entire list, zero
dependencies.

Because of (b) and the sheer count, §3 splits the old Phase 7 into **Phase 7
(get it deployed)** and **Phase 8 (harden and operate it)**.

### 2.3 Two smaller corrections

**Phase 6's starting point moved.** The dashboard is no longer the Phase 1
greeting. Commit `b2c1cbe` rewrote `src/app/(app)/dashboard/page.tsx` from 14
lines to 106: three stat tiles (Tracked / In play / Interview or better), a
7-stage pipeline count strip, a zero-state, all computed from one
`listApplications(userId)` call plus nine in-memory filters. A UI-polish commit
shipped a Phase 6 deliverable early, directly contradicting phase2 spec line 56
("the dashboard keeps its Phase 1 greeting; it does not gain application counts
here"). This is recorded, not complained about, because it changes Phase 6's
brief: the job is now "add a time axis to an honest current-state page", not
"build a dashboard". The existing tiles are the template for how to phrase the
ones that stay. Two incidentals: `dashboard/loading.tsx` skeletons only the
header and the three tiles, so the Pipeline section pops in unskeletoned; and
the N-row fetch to render 10 integers should become a `groupBy` (the pattern
already exists in `statsByResume`).

**Phase 5 is not blocked on a Phase 7 encryption decision.** An earlier reading
had Credentials waiting on encryption-at-rest, itself unassigned. The committed
Phase 5 spec §5 and §9 resolve it independently: AES-256-GCM via `node:crypto`
under a dedicated `CREDENTIALS_KEY` env var, with `CREDENTIALS_KEY_PREVIOUS` for
rotation and a client-level Prisma `omit` on the secret columns. Phase 5 owns
its own secret handling. What remains unowned is *file* encryption at rest —
resumes and, once Phase 4 lands, ID proofs and offer letters are plaintext on
disk. That stays in Phase 8.

---

## 3. The remaining work, as decided phases

**Recommended order — note that it is not numeric:**

> **6a → (4, 5 finish) → 7 → 8 → 6b → 9**

### Phase 6a — The status recorder. Ship this next.

**Yes: the status-history table should be its own phase, and it should land
before Phase 6 rather than inside it.** Three reasons, in order of weight:

1. **Phase 6 cannot satisfy its own prerequisite.** The value of the table is
   proportional to how long it has been recording. Building it as Phase 6 task 1
   guarantees the first funnel chart is drawn on a week of data.
2. **It is small and isolated.** One additive model, one migration, no backfill,
   no change to any existing row, three functions in one file
   (`src/server/repositories/application-repository.ts`). No UI. It touches
   nothing Phase 4 or Phase 5 touch.
3. **Nothing else on the roadmap decays.** Every other outstanding item costs
   the same whenever it is done. This one gets strictly worse.

**Scope:** the `ApplicationStatusEvent` model (append-only: no update, no delete
operation), a `StatusEventSource` enum (`CREATE` / `BOARD_DRAG` / `EDIT_FORM` /
`BACKFILL`), migration `add_application_status_event`, back-relations on `User`
and `Application`, and the three write sites. No charts, no route, no nav entry.

**Design points the plan must carry:**

- **Store `fromStatus`, do not derive it.** The entire risk of this feature is a
  missed write, and a redundant column is the only thing that makes one
  *detectable*: "every row's `fromStatus` equals the previous row's `toStatus`
  for that application" is a one-query invariant and should be a test.
  Derivation via window function would make a gap look like a legitimate
  transition forever.
- **Write in the repository, inside `prisma.$transaction`.** Not the service:
  both `update` and `updateStatus` use `updateMany` for ownership scoping and
  branch on `count === 0`, so only the repository knows whether the write landed.
  Not Prisma middleware: it would need a re-read for the before-image and hides
  the write where nobody reading `application-service.ts` will find it. Precedent
  exists — `resume-repository.ts createProject` already wraps `$transaction`.
- **Three mechanical changes to `application-repository.ts`:**
  1. `updateStatus` (line 66) does a straight `updateMany` with no prior read. It
     must read the previous status *inside the same transaction*, or `fromStatus`
     is a guess and two concurrent drags produce two events claiming the same
     origin.
  2. Both `update` and `updateStatus` must skip the event when previous ===
     next. Today a no-op status write is harmless; with history it manufactures
     a zero-duration stage that poisons every median. The board already guards
     this client-side in `onDragEnd`; the server does not.
  3. `update` (line 34) writes `status: data.status` unconditionally as part of
     a full-row write. The before-image is free one layer up —
     `updateApplication` already calls `findById` — but the read must move
     *inside* the transaction or it races the board.
- **The genesis event is not always `SAVED`.** `applicationFields.status`
  defaults to `SAVED` but the create sheet renders all seven options. A genesis
  row hardcoded to `SAVED` would be fabricated data.
- **The edit sheet is the path that silently breaks this.** A reviewer reading
  only `changeStatus` will conclude status writes are centralised. They are not:
  `updateApplication` writes status as one field of a full-row update, shares
  the same select as create, and is reachable from every board card, the
  applications table, *and* the company detail page. Miss it and the funnel
  under-counts forever with no error and no symptom.
- **Test fixtures that bypass the service** (`prisma.application.create` direct,
  in `company-repository.test.ts:38,85`, `resume-repository.test.ts:191,214,224,338,361`,
  `resume-service.test.ts:282,305,353,519`, `company-service.test.ts:120`)
  produce applications with zero events — a state the running app can never
  reach. Either move them to the service, or state explicitly that "every
  application has at least one event" is not an assumed invariant.
- **Verified: there is no fourth writer.** All Prisma access is inside
  `src/server/repositories`; `src/app/api/` holds only the NextAuth route and a
  read-only file route; there is no seed script, no import, no bulk action.

**Owner's call inside this phase:** `onDelete` on
`ApplicationStatusEvent.application`. Recommendation is **Cascade** — deleting an
application usually means "this was never real", and the alternative that
preserves history (keep events, null the FK) requires a denormalised
company/role snapshot to stay meaningful, which is a second thing to keep in
sync. But it is a deliberate divergence from Phase 2's Restrict-on-company
precedent (chosen for exactly the "don't silently destroy history" reason), so
it must be argued in the spec, not defaulted. Trade-off in one line: Cascade
means your conversion rate changes retroactively when you tidy up; the
snapshot alternative costs two extra columns and a sync obligation forever.

### Phases 4 and 5 — finish as specced

Both specs are committed and structurally complete. No change to their scope
from this document. Phase 5's spec states the two are mutually independent, so
either order is fine. Note for Phase 4: its §1.1 flags that it *interprets*
"vault" because the master product prompt was unavailable — the scope is a
derivation, and worth one confirmation before implementation planning.

### Phase 7 — Deployment. Everything needed to run this somewhere that is not a laptop.

**Moved ahead of Phase 6 deliberately.** Two reasons. First, Phase 6 is
retrospective, low-frequency analysis — nobody changes their job search on a
Tuesday because of a conversion rate; the payoff lands at the *end* of a search.
Deployment blocks actual use. Second, and more usefully: putting 7 before 6b
buys the recorder its runway for free. By the time 6b is built it will have
months of real transitions instead of a fortnight.

The dependency chain inside this phase is fixed: **the storage driver decides
the host, the host decides the body-size ceiling and the header mechanism.**
Start there. The `jwt` fix has no dependencies and can go first or last.

### Phase 8 — Hardening and operations. Everything the perimeter and the long run need.

Boundary security, observability, lifecycle jobs (GC, quotas), accessibility,
dependency hygiene, and the carried debt from Phases 2 and 3. Split from Phase 7
because none of it blocks a first deployment and all of it is independent of the
host decision.

### Phase 6b — Analytics. Build it when the recorder has data.

Dashboard widgets with a time axis, career analytics, the activity timeline.
By this point the timeline has three real sources: `ApplicationStatusEvent`
(6a), `Task.completedAt` (Phase 5), and document filing dates (Phase 4).

**What is honestly computable today, without any new table** — worth writing
into the 6b spec so the phase does not over-claim: current pipeline distribution;
Tracked / In play / Interview-or-better; applications per company; applications
*created* per week (label it "added", not "applied"); applications per week by
`appliedAt` *with a stated denominator* ("N of M have an applied date"); age of
an application; "untouched since" (last edit of any field — it may **not** be
labelled "no movement" or "stalled"); per-resume current-state stats and the
unlinked count; resume inventory. Conditional: salary distribution only grouped
by currency (`currency` is free-text `String(10)`, so a median across mixed
INR/USD is arithmetic on incomparable numbers) and work-mode split with the
same coverage sentence. **Not honest as a chart:** source breakdown — `source`
is free text, so "LinkedIn", "linkedin" and "Linkedin" are three sources; show
a raw counted list, never a pie chart implying a closed taxonomy.

### Phase 9 — Account recovery. Conditional on a second user ever existing.

Email-sending infrastructure and everything blocked on it. Three separate
phases have now deferred work onto infrastructure nobody owns (Phase 1 §3 twice,
Phase 4 §3 for expiry reminders); this phase owns it. **Condition:** for a
single-operator instance where the operator has database access, a forgotten
password is recoverable with one `UPDATE` — so this is not a launch blocker
today. It becomes one the moment a second person has an account, and it should
be built before that happens, not after.

---

## 4. Every outstanding item, with a home

Tags: `[deploy]` blocks deployment · `[security]` · `[a11y]` · `[quality]`

### Phase 6a — The status recorder

| Item | Tag |
|---|---|
| `ApplicationStatusEvent` model + `StatusEventSource` enum + `add_application_status_event` migration | `[quality]` |
| Genesis event in `applicationRepository.create` — status from the form, never hardcoded `SAVED` | `[quality]` |
| Transition event in `updateStatus` (board drag + keyboard drag; needs a prior read inside the transaction) | `[quality]` |
| Transition event in `update` (edit sheet — the path that silently breaks the funnel) | `[quality]` |
| Server-side no-op guard: skip the event when previous === next, in both paths | `[quality]` |
| `onDelete` decision on the application relation, argued in the spec | `[quality]` |
| `fromStatus` continuity invariant as a test | `[quality]` |
| Decide what to do about the 11 test fixtures that create applications directly via Prisma | `[quality]` |

### Phase 7 — Deployment

| Item | Tag |
|---|---|
| **Choose the host.** Serverless vs persistent container. Everything below depends on it. | `[deploy]` |
| **Cloud storage driver** — `getStorage()` (`src/server/storage/index.ts:17-22`) has exactly one `case`, and `local-driver.ts` writes to `process.cwd()/.uploads`. Cannot work on serverless. See §6. | `[deploy]` |
| Signed-URL redirect in `src/app/api/resume-versions/[id]/file/route.ts` — `storage.url()` returns null by design for local; the `if (signed) redirect(signed)` line Phase 3 §5.2 specifies is not written yet | `[deploy]` |
| Re-validate `MAX_UPLOAD_BYTES` (10MB, `src/server/files/pdf.ts:14`) against the chosen host's body limit. Vercel's function body limit is 4.5MB — below the product limit. Both Next flags carrying this are `experimental`. | `[deploy]` |
| **CI** — nothing in the repo runs lint, `tsc`, Vitest or Playwright on a push. Phase 2's own process lesson (a real defect surviving six tasks because lint ran once) is still enforced by nothing but memory. | `[deploy]` |
| **Make the tests runnable in CI** — 12 of 18 Vitest files are integration tests against whatever `DATABASE_URL` points at, sharing one database. Two concurrent CI jobs would race each other's rows. | `[deploy]` |
| **Fix `playwright.config.ts`** — `command: "pnpm dev"` (not a production build), unconditional `reuseExistingServer: true` (must be `!process.env.CI`), no `retries`, no `forbidOnly`, no reporter, no trace/screenshot/video, no `projects` so only one engine is exercised | `[deploy]` |
| **Deploy artefact** — no Dockerfile, no `vercel.json`/`fly.toml`/`render.yaml`, no `output: "standalone"` | `[deploy]` |
| **Wire `prisma migrate deploy` into the deploy path** — documented nowhere; `README.md:22` gives only the dev-mode command | `[deploy]` |
| **Boot-time env validation** — `src/lib/db/prisma.ts:6-8` is the only guard in the codebase. A deploy missing `AUTH_SECRET` starts and serves traffic, failing at first sign-in. `getStorage()` already does this correctly for one variable; generalise it. Phase 5 adds `CREDENTIALS_KEY` to the list. | `[deploy]` `[security]` |
| `NEXT_PUBLIC_APP_URL` is declared in `.env.example:3` and referenced in zero source files — nothing pins a canonical origin | `[deploy]` `[security]` |
| **Error boundaries** — no `error.tsx` or `global-error.tsx` at any level. Any uncaught render error shows Next's bare "Application error" shell with no recovery path. Also no root `not-found.tsx`. | `[deploy]` `[quality]` |
| **Health/readiness route** — no endpoint for a load balancer to probe | `[deploy]` |
| **The `jwt` callback fix** — one lookup in `auth.config.ts:8-17` closes both the deleted-user session and password-change invalidation. Do this first; it depends on nothing. | `[security]` |
| **Security headers** — `next.config.ts` has no `headers()`: no CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy, COOP/CORP, and `poweredByHeader` is on. Referrers currently leak `/resumes/[id]` and `/companies/[id]` to any external job URL a user follows. | `[security]` |
| **`serverActions.allowedOrigins`** — every mutation is a Server Action; Next's Origin/Host check is the only CSRF control, and `trustHost: true` is what makes it fragile | `[security]` |
| **`trustHost: true` unconditional** (`auth.config.ts:4`) — correct for dev, permits host-header manipulation of auth redirects behind an untrusted proxy. Make it conditional on the verified origin. | `[security]` |
| Truth up `README.md` — remove the false "sortable table" claim, document Phase 3 and the `STORAGE_DRIVER`/`UPLOADS_DIR` variables, replace dev-only deploy instructions | `[quality]` |
| Un-ignore `src/components/ui/**` in `eslint.config.mjs:16` — do it here, because CI is what makes a lint change mean anything (rationale in Phase 8) | `[a11y]` |

### Phase 8 — Hardening and operations

| Item | Tag |
|---|---|
| **Rate limiting** on `/login`, `/signup`, upload, and Phase 5's credential-reveal step-up. Every login attempt costs a full argon2id verification, so a request flood is also a cheap CPU-exhaustion DoS. Deferred in four specs, each justifying it with "single-user personal tracker" — an argument that expires on a public origin. | `[security]` |
| **Observability** — the entire logging surface is 5 `console.error` calls in `resume-service.ts`. The storage-rollback failure at :293 and "row has no stored object" at :355 are exactly the events that produce user-visible corruption, and they land in stdout with no aggregation, no alert, no correlation id. No `src/instrumentation.ts`. | `[deploy]` `[security]` |
| **Storage garbage collection** — every process death between `storage.put` and the database transaction leaves an unreferenced file; every failed delete leaves another. Nothing reclaims them. Phase 4 adds a second prefix (`documents/`) to sweep. | `[deploy]` |
| **Per-user storage quota** — no check anywhere. Combined with no rate limit and no version deletion, one account can fill the volume 10MB at a time. | `[deploy]` `[security]` |
| **Individual resume version deletion** — Phase 3 §13 flags it as the decision most likely to be revisited, and its absence is what makes the quota gap unbounded. Build it *with* the quota: it must answer current-version repointing, referenced-version refusal, and storage cleanup together. | `[quality]` |
| **Encryption at rest for files** — resumes, and once Phase 4 lands, ID proofs and offer letters, are plaintext on disk readable by the server process. File modes (0o700/0o600) are the only control. (Phase 5's *credentials* are separately handled and are not part of this.) | `[security]` |
| **Password policy** — `auth-schemas.ts:3-7` accepts "password1": min 8, one letter, one digit. No length-over-complexity rule, no breach-list k-anonymity check, no strength signal. | `[security]` |
| **Signup discloses whether an email is registered** (`signup/actions.ts:17-19`). Login is correctly uniform, so signup is the only oracle — walkable at full speed without a rate limit. Fix with the rate limit, or with the Phase 9 verification flow. | `[security]` |
| **Dependency scanning** — `next-auth` is pinned to `5.0.0-beta.32`, a pre-release owning every auth decision, and nothing watches for advisories against it or the other 20 production dependencies. No `pnpm audit` step, no Dependabot/Renovate. | `[security]` |
| **Legacy `javascript:` URLs** — the Phase 2 protocol refine guards new writes only. The current database has none, so this is a migration with nothing to migrate, but a restored backup or an import reintroduces it. Add a read-time guard or a backfill. | `[security]` |
| **Audit log of auth and file access** — nothing records who opened what. The specs' justification ("there is one 'who'") dissolves with a second account. | `[security]` |
| **Skip link** — `app-shell.tsx:29-31` has no bypass mechanism; every keyboard user tabs the whole sidebar and topbar on every page load. WCAG 2.4.1, Level A. Ten lines. | `[a11y]` |
| **Sidebar is not a `<nav>` landmark** — `SidebarContent` is a plain `<div>`. `SidebarInset` correctly renders `<main>` and the topbar is a `<header>`, so this is the one landmark missing from an otherwise correct structure. | `[a11y]` |
| **Automated accessibility testing** — no axe-core, no `@axe-core/playwright`, no jest-axe. Every contrast ratio in `ui-followups.md` was measured by hand, so nothing prevents the next palette change from silently regressing them. | `[a11y]` |
| **No component/DOM test layer at all** — `vitest.config.ts` is `environment: "node"` and includes only `*.test.ts`; no `@testing-library/react`, no `.test.tsx` in the repo. The most intricate a11y work in the codebase is untested: the board card's Enter/Space split between sheet trigger and drag activator (`application-card.tsx:92-160`, 30 lines of comment explaining why they must not collide), every focus-visible treatment, every dialog focus trap, every form error announcement. | `[a11y]` `[quality]` |
| **dnd-kit announcements are defaults** — the mechanics are right (`setActivatorNodeRef` with an `aria-label`, DragOverlay present) but there is no custom `announcements`/`screenReaderInstructions`, so a keyboard user hears generic coordinate narration instead of "Moved to Interview". | `[a11y]` |
| **Form-error and toast announcement never verified against a screen reader** — `ui/sonner.tsx` relies on sonner's defaults; the Zod flattened-error pattern has no verified `aria-describedby`/`aria-invalid` wiring test. Phase 1 §11 specified the rendering, not the announcement. | `[a11y]` |
| **Recorded contrast deviation, keep it** — the dark `SAVED` lozenge pairs `#4B4D51` with `#E2E3E4` rather than the ADS-specified `#A9ABAF`, because the specified pairing measures 3.68:1 against the 4.5:1 an 11px label needs. Deliberate and documented; any future token sync must preserve the override. | `[a11y]` |
| **Coverage reporting** — `vitest.config.ts` configures no provider and no thresholds. `src/lib/utils.ts`, `src/lib/db/prisma.ts`, `src/server/storage/storage.ts`, `src/lib/auth/auth.ts` and `auth.config.ts` have no sibling tests — `auth.config.ts` being untested is notable given it is where the §2.2(c) fix lands. | `[quality]` |
| **E2E hole around Settings** — nothing exercises profile update, password change, or the appearance control | `[quality]` |
| **`notes` length divergence** — 500 chars in `company-schemas.ts:10`, 2000 in `application-schemas.ts:9`, both via an identically-named local `optionalText` | `[quality]` |
| **Deleting an application works only from the Table view** — `DeleteApplicationDialog` is imported by `application-table.tsx` alone, so a board-only user must switch views | `[quality]` |
| **Optimistic-drag race** — if a props re-sync lands mid-drag *and* the status write then fails, the revert targets the pre-re-sync snapshot until the next navigation | `[quality]` |
| **Tag rename for the vault** — Phase 4 §9.2 calls it "one repository function over `tags: { has: old }`" and the decision most likely to be revisited | `[quality]` |
| **Delete the `create-next-app` scaffold artefacts** — `public/{file,globe,next,vercel,window}.svg`, referenced nowhere | `[quality]` |

### Phase 6b — Analytics

| Item | Tag |
|---|---|
| Funnel and conversion charts on `ApplicationStatusEvent` (including the offer→accept rate the Phase 2 enum split was shaped for) | `[quality]` |
| Time-in-stage, velocity, aging and stall detection — with `source = BACKFILL` rows excluded from every duration metric | `[quality]` |
| Activity timeline, assembled from status events + `Task.completedAt` + document filing dates | `[quality]` |
| Resume A/B on *reached* stage (the payoff the `Resume.skills` schema comment names) — replacing `statsByResume`'s weaker "currently sits at interview or beyond" | `[quality]` |
| Replace the dashboard's N-row fetch + nine in-memory filters with `groupBy` (pattern exists in `statsByResume`) | `[quality]` |
| Per-company counts and recent activity — the remainder of `ui-followups.md:129-133` | `[quality]` |
| Fix `dashboard/loading.tsx` to skeleton the Pipeline section | `[quality]` |
| **Table sorting** — Phase 2's unshipped §7 promise. Homed here because 6b is already changing repository ordering, and both repositories currently hard-order by `updatedAt desc` (`application-repository.ts:11,22`). | `[quality]` |
| Full-text search for the vault, *if* row counts justify it — Phase 4 ships ILIKE and names "a few thousand rows" as the trigger | `[quality]` |

### Phase 9 — Account recovery (conditional; see §3)

| Item | Tag |
|---|---|
| **Email-sending infrastructure** — the shared prerequisite, deferred by Phase 1 §3 and again by Phase 4 §3, owned by nobody until now | `[security]` |
| **Password reset** — today there is no reset route, no token model, and the only password change requires knowing the current one. Recoverable by the operator via the database; an unrecoverable lockout for anyone else. | `[security]` |
| **Email verification** — signup accepts any syntactically valid address, so accounts can be created against addresses the registrant does not control | `[security]` |
| **Changing the login email** — deferred in Phase 1 §7 because it needs verification; inherits the same dependency | `[quality]` |
| **Expiry reminders / notifications** for Phase 4 documents — needs both email delivery and scheduling | `[quality]` |
| **Google OAuth** — wiring is fully scoped in Phase 1 §8 (provider entry, PrismaAdapter, Account/Session/VerificationToken models, JWT sessions retained) but was deferred "until a phase where the OAuth client credentials are available" and no such phase was ever named. Lowest-value item on this list for a single-user app; password reset is the one that matters. | `[quality]` |

---

## 5. Deliberately not doing

Scope is bounded here so the backlog stops growing by default. Each of these was
refused in a spec and is not being revived.

- **Sharing / public links.** The single most load-bearing non-goal in both
  Phase 3 §3 and Phase 4 §3. **If it is ever added, it carries a bill that is
  currently invisible to whoever adds it**, and this is the only place the bill
  is written down: (a) PDF is a scriptable format and is served unmodified —
  sound today only because attacker and victim are the same person, and both
  specs state the paragraph stops being sufficient the moment sharing exists;
  (b) EXIF metadata is preserved on uploaded images, so a photographed
  certificate carries GPS, device serial and timestamp; (c) the whole
  single-reader threat model underpinning Phase 5's credentials and the "there
  is one 'who'" audit-log justification collapses.
- **Global cross-module search.** Phase 2 §3 called it "its own later phase" and
  never numbered it. Per-module search is sufficient at single-user scale.
- **Interview rounds and recruiter contacts.** Phase 2 §3, "their own
  subsystem". Follow-up *reminders* are absorbed by Phase 5 tasks, which make
  "Send follow-up to Acme" a first-class row with a due date.
- **Manual card ordering within a board column.** No `position` field on
  Application, `@dnd-kit/sortable` deliberately omitted.
- **User-customisable statuses.** The pipeline stays a fixed enum — and now that
  6a records against it, changing it later has a data-migration cost it did not
  have before.
- **Bulk actions, CSV import/export, archiving, "download all as zip".** Phase 2
  §3 and Phase 4 §3: additive, not structural.
- **Cover letters as a dedicated feature.** Phase 3 §3 pointed at the vault;
  Phase 4 did not adopt them. A cover letter is a document.
- **Resume parsing, OCR, text extraction, AI rewriting/tailoring/scoring, and
  version diffing.** Refused in Phase 3 §3 and again in Phase 4 §3. Diffing is
  blocked on the extraction that is refused, so it is doubly out.
- **Recurring tasks, collaboration, assignees, comments.** Phase 5 §3.
- **A `WITHDRAWN` status.** Cut in Phase 2 §3. Consequence to accept knowingly:
  an application you walked away from and one you lost are both `REJECTED`, so
  the rejection rate is corrupted independently of history, and 6a does not fix
  it. If this ever matters more than enum stability, it is a schema change plus
  a migration plus a recorded-history reinterpretation.

---

## 6. Known risks and honest caveats

**The storage driver is local-disk only and cannot work on serverless.**
`getStorage()` (`src/server/storage/index.ts:14-23`) switches on `STORAGE_DRIVER`
with exactly one case and throws on anything else — deliberately, so a typo in a
deploy env fails loudly rather than writing production resumes to ephemeral
disk. The only implementation resolves its root as
`process.cwd()/$UPLOADS_DIR` and does real `mkdir`/`writeFile`/`readFile`/`rm`.
On Vercel or Lambda the bundle filesystem is read-only apart from `/tmp`, which
is per-instance and ephemeral: an upload either throws `EROFS`, or succeeds onto
one instance's scratch disk while the next `GET` lands elsewhere and 404s a
version the library insists exists — precisely the failure mode Phase 3 §8.5
ordered its writes to avoid, reintroduced by the deployment target rather than
by the code. Even on a persistent container it needs an explicitly mounted
durable volume, or every redeploy destroys every file. The interface is well
designed for the swap (keys and bytes, `Uint8Array` not `Buffer`, contentType
accepted-and-ignored so a cloud driver can set it at write time) and
`src/server/storage/index.test.ts` already covers default/local/unknown, so the
factory has a harness waiting. Both Phase 3 §5.2 and Phase 4 §13 promise "one
new file and one `case`" — plus the signed-URL redirect in the file route.
None of it is written.

**There are 52 real uploaded files in exactly one place, with no backup.**
`.uploads/` is gitignored (`.gitignore:42`), so those bytes exist on one laptop
and nowhere else. This is live data, not a hypothetical, and it is the strongest
practical argument for putting Phase 7 ahead of Phase 6.

**The host decision is the owner's call and it has a hidden cost.** Serverless
(Vercel) forces the cloud driver *and* drops the request-body ceiling to 4.5MB,
below the 10MB product limit in `src/server/files/pdf.ts:14` — so choosing it
means re-deciding `MAX_UPLOAD_BYTES` and re-validating against the class of
silent-truncation bug that `next.config.ts:5-24` was written to prevent. A
persistent container (Fly, Render, a VM) keeps the local driver working with a
mounted volume and keeps the 10MB limit, at the cost of owning the box, the
volume and the backups.

**Whether a second person will ever have an account is the other owner's call,
and it decides two phases.** If the answer is no, Phase 9 is optional forever
and roughly half of Phase 8's security items keep the "one 'who'" justification
the specs gave them. If the answer is yes, Phase 9 comes before that person
signs up, not after, and the audit-log and enumeration items stop being
deferrable.

**Three concurrent workflows means one shared file.** Phase 4, Phase 5 and 6a
each add models to `prisma/schema.prisma` and a directory to
`prisma/migrations/`. The code files do not overlap at all — 6a touches only
`application-repository.ts` — but migration ordering does. Recommendation:
sequence 6a to start immediately after whichever of Phase 4 or Phase 5 merges
first, so there is exactly one open migration stream at a time. That is the
only reason 6a is not being started this minute.

**Backfilled history rows are contaminated by construction.** If 6a ever
synthesises a genesis row for the 3 existing applications, `changedAt` comes
from `updatedAt`, which moved the last time a note was edited. That is what the
`source` enum exists for, and `BACKFILL` rows must be excluded from every
duration metric — a rule that has to be enforced in query code, not remembered.

**The test suite is not hermetic.** 12 of 18 Vitest files hit whatever
`DATABASE_URL` points at, with a 30s timeout sized for a remote us-west-2
database. Before CI exists this is a convenience; the moment CI exists it is a
provisioned-Postgres-plus-secret requirement and a concurrency hazard, and it is
the item most likely to make "add CI" take a day instead of an hour.

**`next-auth@5.0.0-beta.32` owns every authentication decision in the app.** A
pre-release, with nothing watching for advisories against it. It has been stable
in practice; it is still the dependency whose breakage would be worst and whose
upgrade path is least predictable.

**Phase 3 has no implementation plan on disk.** Phases 1 and 2 have both a spec
and a plan in `docs/superpowers/plans/`; Phase 3 has only the spec. Nothing is
broken by this, but the record of *why* Phase 3 was built the way it was is
thinner than for its neighbours, which matters when Phase 8 starts changing its
storage and quota behaviour.

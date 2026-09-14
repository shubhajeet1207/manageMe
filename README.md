# ManageMe

A personal career & productivity management platform.

Implemented so far:

- **Phase 1 — Foundation:** auth (sign up, log in, profile, password), app
  shell, design system.
  See `docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`.
- **Phase 2 — Core career:** companies, applications, a seven-stage status
  pipeline, a drag-and-drop board, and a table view that filters by status and
  sorts by company, role, pipeline stage, applied date or last update. The sort
  lives in the URL (`?sort=role&dir=asc`) and is applied on the server, so a
  sorted view is a link you can send someone.
  See `docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`.
- **Phase 3 — Resume system:** named resume slots, each holding an append-only
  history of uploaded PDF versions with one nominated as current, previewed in
  the browser's own PDF viewer. An application can record which version was
  actually sent, and each slot reports how the applications that used it now
  stand. Uploaded bytes are stored outside `public/` and are served only
  through a route that checks ownership first — there is no URL that hands a
  file to someone who guesses it.
  See `docs/superpowers/specs/2026-09-13-phase3-resume-system-design.md`.
- **Phase 4 — Documents:** a private document vault — offer letters,
  certificates, IDs — with tags instead of folders, server-side search whose
  query lives in the URL, optional expiry dates, and an accepted file type
  decided by the bytes rather than by what the browser claimed.
  See `docs/superpowers/specs/2026-09-13-phase4-documents-design.md`.
- **Phase 5 — Productivity:** projects and tasks (a task can belong to a
  project *or* to a job application), tagged links, QuickDrop capture and
  triage, and a credential vault encrypted at rest with AES-256-GCM under its
  own key.
  See `docs/superpowers/specs/2026-09-13-phase5-productivity-design.md`.
- **Phase 6 — Analytics:** every status transition recorded through a single
  chokepoint, and an `/analytics` page reporting the pipeline funnel,
  stage-to-stage conversion, time in stage, and per-company and per-resume
  outcomes.
  See `docs/superpowers/specs/2026-09-13-phase6-analytics-design.md`.

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and fill it in. `.env.example` is the full
   list and explains each variable; the ones you cannot start without are:
   - `DATABASE_URL` — a PostgreSQL connection string (a free
     [Neon](https://neon.tech) project works well for local dev)
   - `AUTH_SECRET` — generate with `pnpm dlx auth secret`
   - `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for local dev
   - `CREDENTIALS_KEY` — 32 random bytes, base64 (`openssl rand -base64 32`).
     Encrypts stored credential passwords. Distinct from `AUTH_SECRET` on
     purpose; the Credentials page refuses to work without it.
   - `STORAGE_DRIVER` — which driver serves uploaded resume and document
     bytes. `"local"` is the only supported value today; anything else throws
     at startup rather than silently writing uploads to a container's
     ephemeral disk.
   - `UPLOADS_DIR` — where the local driver keeps those bytes, resolved
     against the process's working directory. Defaults to `.uploads`, which is
     gitignored and deliberately outside `public/` so nothing is statically
     served.
3. Apply the database schema: `pnpm exec prisma migrate deploy` — it applies
   the committed migrations exactly, and is the same command used in CI and in
   production. (Use `pnpm exec`, not `pnpm dlx` — `dlx` fetches a newer Prisma
   CLI whose commands differ from the version this project pins.)
   Reach for `pnpm exec prisma migrate dev` only when you are *authoring* a new
   migration from a schema change: it is interactive, it writes new migration
   files, and it can offer to reset the database.
4. Start the dev server: `pnpm dev`

## Testing

- Unit/integration tests: `pnpm test`. The integration tests run against the
  real database in `DATABASE_URL` and clean up their own rows, so point it at a
  database you are willing to have written to — never a production one.
- Coverage: `pnpm exec vitest run --coverage` (HTML report in `coverage/`).
  The provider, `@vitest/coverage-v8`, is not in `devDependencies` yet —
  vitest offers to install it the first time you ask for coverage. No
  thresholds are enforced; see the note in `vitest.config.ts` for why, and for
  how to set one that means something.
- End-to-end tests: `pnpm test:e2e`. Locally this reuses a dev server on port
  3000 if one is already running and starts `pnpm dev` otherwise; under `CI=1`
  it builds and starts the production server instead. The suite runs against
  Chromium, Firefox and WebKit — `pnpm test:e2e --project=chromium` is the fast
  path while iterating.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
typecheck, lint, and the Vitest suite, then the Playwright suite. A new push
cancels the run still in flight for the same branch.

CI never touches the developer's database. Each job brings up its own
PostgreSQL service container and runs `prisma migrate deploy` against it, so
concurrent runs cannot race each other's rows.

## Deployment

A Node.js server (`next start`); see Next.js's own
[deploying](https://nextjs.org/docs/app/getting-started/deploying) guide for
the other options. From a clean checkout:

1. `pnpm install --frozen-lockfile`
2. `pnpm exec prisma generate` — Prisma Client is generated code; nothing
   imports successfully until this has run.
3. `pnpm build`
4. `pnpm exec prisma migrate deploy` — against the production database, before
   the new build starts serving. It is non-interactive, applies only
   already-committed migrations, and never resets or drops anything.
5. `pnpm start`

Set the same environment variables as above, with `NEXT_PUBLIC_APP_URL` at the
deployed origin, plus one that only production needs:

- `AUTH_URL` — the deployed origin, e.g. `https://app.example.com`. In
  production the app refuses to trust the `Host`/`X-Forwarded-Host` header
  unless an origin is pinned this way, because next-auth builds callback and
  redirect URLs out of that header. Without it every request that touches a
  session answers 500 and the logs say `UntrustedHost`. `NEXT_PUBLIC_APP_URL`
  cannot stand in for it: next-auth reads `AUTH_URL` and `NEXTAUTH_URL` and no
  other name.

`AUTH_SECRET` and `CREDENTIALS_KEY` are independent secrets
with different blast radii — do not reuse one as the other — and rotating
`CREDENTIALS_KEY` needs `CREDENTIALS_KEY_PREVIOUS`; `.env.example` describes
that procedure.

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma ·
PostgreSQL · Auth.js v5 · Vitest · Playwright

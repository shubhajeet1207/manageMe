# ManageMe

A personal career & productivity management platform.

Implemented so far:

- **Phase 1 — Foundation:** auth (sign up, log in, profile, password), app
  shell, design system.
  See `docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`.
- **Phase 2 — Core career:** companies, applications, a seven-stage status
  pipeline, a drag-and-drop board and a sortable table.
  See `docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`.

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a PostgreSQL connection string (a free
     [Neon](https://neon.tech) project works well for local dev)
   - `AUTH_SECRET` — generate with `pnpm dlx auth secret`
   - `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for local dev
3. Apply the database schema: `pnpm exec prisma migrate dev` (use `pnpm exec`, not
   `pnpm dlx` — `dlx` fetches a newer Prisma CLI whose commands differ from the
   version this project pins)
4. Start the dev server: `pnpm dev`

## Testing

- Unit/integration tests: `pnpm test` (integration tests run against
  the real database in `DATABASE_URL` and clean up their own rows)
- End-to-end tests: `pnpm test:e2e` (starts the dev server automatically)

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma ·
PostgreSQL · Auth.js v5 · Vitest · Playwright

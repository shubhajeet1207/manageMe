# ManageMe

A personal career & productivity management platform. This repo currently
implements Phase 1 (Foundation) — see
`docs/superpowers/specs/2026-08-24-phase1-foundation-design.md` for the
full design and `docs/superpowers/plans/2026-08-24-phase1-foundation.md`
for how it was built.

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a PostgreSQL connection string (a free
     [Neon](https://neon.tech) project works well for local dev)
   - `AUTH_SECRET` — generate with `pnpm dlx auth secret`
   - `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for local dev
3. Apply the database schema: `pnpm dlx prisma migrate dev`
4. Start the dev server: `pnpm dev`

## Testing

- Unit/integration tests: `pnpm test` (integration tests run against
  the real database in `DATABASE_URL` and clean up their own rows)
- End-to-end tests: `pnpm test:e2e` (starts the dev server automatically)

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma ·
PostgreSQL · Auth.js v5 · Vitest · Playwright

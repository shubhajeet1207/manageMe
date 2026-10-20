# Install, run, and deploy ManageMe

ManageMe is a Next.js application backed by PostgreSQL. It stores application data in the database and keeps uploaded resume and document bytes in a storage driver you configure.

## Requirements

- Node.js 20 or later
- [pnpm](https://pnpm.io/) 10 (the repository pins `pnpm@10.32.1`)
- PostgreSQL 14 or later
- OpenSSL (for generating local secrets)

If Corepack is available, `corepack enable` will make the repository-pinned pnpm version available.

## Local development

From the repository root:

```bash
pnpm install
```

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env # macOS/Linux
```

Set these values in `.env` before running the application:

| Variable | Local development value |
| --- | --- |
| `DATABASE_URL` | A PostgreSQL connection string for a non-production database. |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32`. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `AUTH_URL` | `http://localhost:3000` |
| `CREDENTIALS_KEY` | A *separate* value from `openssl rand -base64 32`. It must decode to exactly 32 bytes. |
| `STORAGE_DRIVER` | `local` |
| `UPLOADS_DIR` | Usually leave the default `.uploads`. |

`CREDENTIALS_KEY` encrypts passwords stored in the credential vault with AES-256-GCM. It is not interchangeable with `AUTH_SECRET`; do not reuse or commit either secret.

Generate the Prisma client, apply the committed migrations, and start the development server:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Use `pnpm exec prisma migrate dev` only while authoring a new migration: it is interactive and may create migration files or offer to reset a database.

The local storage driver writes uploads outside `public/`; `.uploads/` is intentionally ignored by Git. Back up that directory along with the database if it contains material you need to keep.

## Validate changes

```bash
pnpm lint
pnpm test
pnpm test:e2e --project=chromium
pnpm build
```

The test suite uses the database named by `DATABASE_URL` and cleans up rows it creates. Never point it at production. The end-to-end suite reuses a local development server on port 3000 when available; under CI it builds and starts the production server instead.

## Production deployment

ManageMe runs as a Node.js server (`pnpm start`) after a production build. At a minimum, production needs a PostgreSQL database, a durable upload store, an `AUTH_URL` pinned to the public origin, and Upstash Redis for distributed rate limiting.

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm build
pnpm exec prisma migrate deploy
pnpm start
```

Run `prisma migrate deploy` against the production database before the new build begins serving traffic. It applies committed migrations only and does not reset the database.

### Production environment

Copy `.env.example` and configure every required value. In addition to the local-development values above:

- Set `NODE_ENV=production`, `NEXT_PUBLIC_APP_URL`, and `AUTH_URL` to the public HTTPS origin.
- Set both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Production fails closed if shared rate limiting is unavailable.
- Use a durable storage driver. `local` works only on a persistent Node host with a mounted, backed-up volume; it is not suitable for Vercel or other serverless hosts.
- For Cloudflare R2, set `STORAGE_DRIVER=r2` plus `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`.
- For Backblaze B2, set `STORAGE_DRIVER=b2` plus `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, and `B2_BUCKET`. Copy the bucket's S3-compatible endpoint exactly from B2.

The application validates its environment on boot and reports missing or malformed settings without exposing secret values. See [`.env.example`](../../.env.example) for the complete, commented reference, including rate-limit hashing and credential-key rotation.

### Vercel

`vercel.json` identifies the project as Next.js and pins its deployment region. Use R2 or B2 for uploaded files; a serverless filesystem cannot safely retain resumes or documents between requests. Configure all production variables in the project settings, deploy, then verify `/api/health` and an authenticated upload/download flow.

## Useful Prisma commands

```bash
pnpm exec prisma studio
pnpm exec prisma migrate status
pnpm exec prisma generate
```

`prisma studio` is a local developer tool. Do not expose it publicly or use it to bypass application-level ownership checks.

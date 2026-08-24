# ManageMe Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the ManageMe project — Next.js app, Postgres/Prisma, Auth.js credentials-based auth, design system, and app shell — so a user can sign up, log in, edit their profile/password, log out, and every later phase can build on the same layered architecture.

**Architecture:** Layered `UI → Server Action → Service → Repository → DB`. Server Components fetch session/data directly; Client Components only exist where interactivity (forms, dropdowns, theme toggle) requires it. Auth.js v5 with a single Credentials provider and JWT sessions; no OAuth, no email verification, no DB-persisted sessions this phase.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui ("new-york") · Radix UI · Lucide icons · React Hook Form + Zod · PostgreSQL (Neon) · Prisma · Auth.js v5 (`next-auth@beta`) · `@node-rs/argon2` · `next-themes` · shadcn `sonner` · Vitest · Playwright · pnpm.

**Spec:** `docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`

## Global Constraints

- Package manager is **pnpm** for every install/run command in this plan.
- Session strategy is **JWT** — required because a Credentials provider is configured; do not add a Prisma Adapter or DB-persisted sessions this phase.
- Do **not** create `Account`, `Session`, or `VerificationToken` Prisma models this phase — they're added in the phase that introduces Google OAuth.
- Every Server Action must re-validate its input with the same Zod schema used client-side — never trust client-side validation alone.
- Login/signup failures never reveal whether an email exists: login always returns the generic message "Invalid email or password"; signup returns a specific "email already exists" field error (this is intentionally asymmetric — see spec §7 rationale: signup benefits the user by naming the conflict, login must not leak existence).
- Password hashing is **argon2id** via `@node-rs/argon2` — no other hashing library.
- Sidebar navigation shows only **Dashboard** and **Settings** — no items, links, or buttons for unbuilt modules (Applications, Resumes, etc.), and no global search box or notification bell this phase.
- The Dashboard page shows a greeting only — no metric cards, no hardcoded/zero placeholder widgets.
- All Prisma/DB-touching tests run against the real dev Postgres database configured in `DATABASE_URL` (no mocking the database) and must clean up every row they create.
- No comments explaining *what* code does — only where a non-obvious *why* exists (e.g., the JWT-session constraint, the asymmetric error messaging).

---

## File Structure

```
manageMe/
  .env.example
  README.md
  prisma/
    schema.prisma
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      (auth)/
        layout.tsx
        login/
          page.tsx
          login-form.tsx
          actions.ts
        signup/
          page.tsx
          signup-form.tsx
          actions.ts
      (app)/
        layout.tsx
        dashboard/
          page.tsx
          loading.tsx
        settings/
          page.tsx
          loading.tsx
          profile-form.tsx
          password-form.tsx
          appearance-form.tsx
          actions.ts
      api/
        auth/
          [...nextauth]/route.ts
    components/
      ui/                     # shadcn-generated primitives
      layout/
        app-shell.tsx
        sidebar-nav.tsx
        topbar.tsx
        user-menu.tsx
        sign-out-button.tsx
      theme-provider.tsx
    server/
      services/
        auth-service.ts
        auth-service.test.ts
      repositories/
        user-repository.ts
        user-repository.test.ts
      validators/
        auth-schemas.ts
        auth-schemas.test.ts
    lib/
      auth/
        auth.ts
        password.ts
        password.test.ts
      db/
        prisma.ts
      utils.ts                # shadcn's cn() helper (generated)
    types/
      next-auth.d.ts
    config/
      site.ts
  middleware.ts
  vitest.config.ts
  playwright.config.ts
  e2e/
    auth.spec.ts
```

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: entire Next.js project skeleton at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`)

**Interfaces:**
- Produces: a running `pnpm dev` server on port 3000, `pnpm build` succeeding, path alias `@/*` → `src/*`.

- [ ] **Step 1: Verify toolchain**

Run: `node --version && (pnpm --version || corepack enable pnpm)`
Expected: Node ≥ 20. If `pnpm --version` fails, `corepack enable pnpm` succeeds and a re-run of `pnpm --version` prints a version.

- [ ] **Step 2: Scaffold the project in the current directory**

Run:
```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm
```
This directory already contains `docs/` and `.git/` — create-next-app only checks for conflicting well-known files (like an existing `package.json`), so it will proceed. If prompted interactively for anything not covered by the flags above (e.g. Turbopack for dev), accept the default.

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 project"
```

---

### Task 2: Install and configure shadcn/ui, theming, and toasts

**Files:**
- Create: `components.json` (shadcn config), `src/lib/utils.ts`, `src/components/ui/*` (button, input, label, form, card, avatar, dropdown-menu, sonner, sidebar, separator, sheet, tooltip, breadcrumb, skeleton), `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: `ThemeProvider` (wraps `next-themes`' `ThemeProvider`, default export from `@/components/theme-provider`), `<Toaster />` from `@/components/ui/sonner`, and every shadcn primitive under `@/components/ui/*` used by later tasks.

- [ ] **Step 1: Init shadcn/ui**

Run: `pnpm dlx shadcn@latest init -d`
Expected: `components.json` created with style `new-york`, base color `slate`, CSS variables enabled; `src/lib/utils.ts` created with `cn()`.

- [ ] **Step 2: Add required components**

Run:
```bash
pnpm dlx shadcn@latest add button input label form card avatar dropdown-menu sonner sidebar separator sheet tooltip breadcrumb skeleton
```
Expected: each component file appears under `src/components/ui/`.

- [ ] **Step 3: Install next-themes and add the theme provider**

Run: `pnpm add next-themes`

Create `src/components/theme-provider.tsx`:
```tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ComponentProps } from "react"

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 4: Wire ThemeProvider and Toaster into the root layout**

Modify `src/app/layout.tsx` to wrap `children` with `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`) and render `<Toaster />` from `@/components/ui/sonner` inside `<body>`, and add `suppressHydrationWarning` on `<html>` (required by `next-themes` since it sets the theme class before hydration):

```tsx
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "ManageMe",
  description: "Career & productivity management platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Verify**

Run: `pnpm build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: install shadcn/ui, theming, and toast primitives"
```

---

### Task 3: Prisma setup with the User model

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db/prisma.ts`, `.env` (local only, gitignored), `.env.example`
- Modify: `.gitignore` (ensure `.env` is ignored — create-next-app's default already covers this; verify)

**Interfaces:**
- Produces: `prisma` singleton export from `@/lib/db/prisma` (typed `PrismaClient`), a `User` table migrated into the Neon database.

- [ ] **Step 1: Install Prisma**

Run: `pnpm add -D prisma && pnpm add @prisma/client`

- [ ] **Step 2: Init Prisma**

Run: `pnpm dlx prisma init --datasource-provider postgresql`
Expected: creates `prisma/schema.prisma` and `.env` with a `DATABASE_URL` placeholder.

- [ ] **Step 3: Set the real connection string**

Create a free Postgres project at Neon (or use an existing one) and copy its pooled connection string into `.env` as `DATABASE_URL="postgresql://...";` — this file is gitignored and never committed.

- [ ] **Step 4: Define the User model**

Replace the contents of `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String   @id @default(cuid())
  name           String?
  email          String   @unique
  hashedPassword String
  image          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 5: Run the migration**

Run: `pnpm dlx prisma migrate dev --name init`
Expected: migration applies against the Neon database with no errors; `prisma/migrations/` gains a new folder.

- [ ] **Step 6: Create the Prisma client singleton**

Create `src/lib/db/prisma.ts`:
```ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```
This avoids exhausting DB connections from Next.js dev-mode module reloads — a fresh `PrismaClient` per reload would otherwise leak connections.

- [ ] **Step 7: Write `.env.example`**

Create `.env.example`:
```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
AUTH_SECRET=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- [ ] **Step 8: Verify**

Run: `pnpm dlx prisma studio --browser none & sleep 2; kill %1` (or simply confirm no error opening it) — or more simply, run `pnpm dlx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib/db .env.example .gitignore
git commit -m "feat: add Prisma with User model and Neon Postgres"
```

---

### Task 4: Password hashing utility (TDD)

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hashed: string): Promise<boolean>` from `@/lib/auth/password`.

- [ ] **Step 1: Install test tooling and the hashing library**

Run: `pnpm add @node-rs/argon2 && pnpm add -D vitest`

- [ ] **Step 2: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing test**

Create `src/lib/auth/password.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "./password"

describe("password", () => {
  it("verifies a correct password against its hash", async () => {
    const hashed = await hashPassword("Password123")
    await expect(verifyPassword("Password123", hashed)).resolves.toBe(true)
  })

  it("rejects an incorrect password", async () => {
    const hashed = await hashPassword("Password123")
    await expect(verifyPassword("WrongPassword1", hashed)).resolves.toBe(false)
  })

  it("produces a hash that is not the plaintext", async () => {
    const hashed = await hashPassword("Password123")
    expect(hashed).not.toBe("Password123")
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test src/lib/auth/password.test.ts`
Expected: FAIL — `./password` has no exported members (module doesn't exist yet).

- [ ] **Step 5: Implement**

Create `src/lib/auth/password.ts`:
```ts
import { hash, verify } from "@node-rs/argon2"

export function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/lib/auth/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add argon2id password hashing with tests"
```

---

### Task 5: Auth validation schemas (TDD)

**Files:**
- Create: `src/server/validators/auth-schemas.ts`, `src/server/validators/auth-schemas.test.ts`

**Interfaces:**
- Produces from `@/server/validators/auth-schemas`: `signupSchema`, `SignupInput`, `loginSchema`, `LoginInput`, `updateProfileSchema`, `UpdateProfileInput`, `changePasswordSchema`, `ChangePasswordInput`.

- [ ] **Step 1: Install Zod**

Run: `pnpm add zod`

- [ ] **Step 2: Write the failing test**

Create `src/server/validators/auth-schemas.test.ts`:
```ts
import { describe, expect, it } from "vitest"
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
  updateProfileSchema,
} from "./auth-schemas"

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Password123",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a password without a digit", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Passwordonly",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Pw1",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "Password123",
    })
    expect(result.success).toBe(false)
  })
})

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "anything",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})

describe("updateProfileSchema", () => {
  it("accepts a non-empty name", () => {
    expect(updateProfileSchema.safeParse({ name: "Ada" }).success).toBe(true)
  })

  it("rejects an empty name", () => {
    expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassword1",
      newPassword: "NewPassword1",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a weak new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldPassword1",
      newPassword: "weak",
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/server/validators/auth-schemas.test.ts`
Expected: FAIL — module `./auth-schemas` does not exist.

- [ ] **Step 4: Implement**

Create `src/server/validators/auth-schemas.ts`:
```ts
import { z } from "zod"

const passwordRules = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number")

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Enter a valid email address"),
  password: passwordRules,
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})
export type LoginInput = z.infer<typeof loginSchema>

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordRules,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/server/validators/auth-schemas.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/validators
git commit -m "feat: add Zod schemas for signup, login, profile, and password change"
```

---

### Task 6: User repository (integration-tested against the real dev DB)

**Files:**
- Create: `src/server/repositories/user-repository.ts`, `src/server/repositories/user-repository.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db/prisma` (Task 3).
- Produces from `@/server/repositories/user-repository`: `findByEmail(email: string): Promise<User | null>`, `findById(id: string): Promise<User | null>`, `create(data: { name: string; email: string; hashedPassword: string }): Promise<User>`, `updateName(id: string, name: string): Promise<User>`, `updatePassword(id: string, hashedPassword: string): Promise<User>`.

- [ ] **Step 1: Write the failing test**

Create `src/server/repositories/user-repository.test.ts`. This hits the real database configured in `.env`'s `DATABASE_URL` and deletes every row it creates:
```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as userRepository from "./user-repository"

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } })
    createdIds.length = 0
  }
})

describe("userRepository", () => {
  it("creates a user and finds it by email", async () => {
    const email = `repo-test-${Date.now()}@example.com`
    const user = await userRepository.create({
      name: "Repo Test",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const found = await userRepository.findByEmail(email)
    expect(found?.id).toBe(user.id)
  })

  it("returns null for an unknown email", async () => {
    const found = await userRepository.findByEmail("no-such-user@example.com")
    expect(found).toBeNull()
  })

  it("finds a user by id", async () => {
    const email = `repo-test-${Date.now()}-2@example.com`
    const user = await userRepository.create({
      name: "Repo Test 2",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const found = await userRepository.findById(user.id)
    expect(found?.email).toBe(email)
  })

  it("updates a user's name", async () => {
    const email = `repo-test-${Date.now()}-3@example.com`
    const user = await userRepository.create({
      name: "Old Name",
      email,
      hashedPassword: "hashed",
    })
    createdIds.push(user.id)

    const updated = await userRepository.updateName(user.id, "New Name")
    expect(updated.name).toBe("New Name")
  })

  it("updates a user's password hash", async () => {
    const email = `repo-test-${Date.now()}-4@example.com`
    const user = await userRepository.create({
      name: "Repo Test 4",
      email,
      hashedPassword: "old-hash",
    })
    createdIds.push(user.id)

    const updated = await userRepository.updatePassword(user.id, "new-hash")
    expect(updated.hashedPassword).toBe("new-hash")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/repositories/user-repository.test.ts`
Expected: FAIL — module `./user-repository` does not exist.

- [ ] **Step 3: Implement**

Create `src/server/repositories/user-repository.ts`:
```ts
import { prisma } from "@/lib/db/prisma"
import type { User } from "@prisma/client"

export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } })
}

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}

export function create(data: {
  name: string
  email: string
  hashedPassword: string
}): Promise<User> {
  return prisma.user.create({ data })
}

export function updateName(id: string, name: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { name } })
}

export function updatePassword(id: string, hashedPassword: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { hashedPassword } })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/repositories/user-repository.test.ts`
Expected: PASS (5 tests), and confirm via `pnpm dlx prisma studio` (or a quick `SELECT count(*) FROM "User"`) that no leftover `repo-test-*` rows remain.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories
git commit -m "feat: add user repository with integration tests"
```

---

### Task 7: Auth service (integration-tested against the real dev DB)

**Files:**
- Create: `src/server/services/auth-service.ts`, `src/server/services/auth-service.test.ts`

**Interfaces:**
- Consumes: `userRepository` (Task 6), `hashPassword`/`verifyPassword` (Task 4).
- Produces from `@/server/services/auth-service`: `createUser(input: { name: string; email: string; password: string }): Promise<User>`, `verifyCredentials(email: string, password: string): Promise<User | null>`, `updateProfile(userId: string, name: string): Promise<User>`, `changePassword(userId: string, currentPassword: string, newPassword: string): Promise<User>`, and error classes `EmailAlreadyExistsError`, `InvalidCurrentPasswordError`.

- [ ] **Step 1: Write the failing test**

Create `src/server/services/auth-service.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  EmailAlreadyExistsError,
  InvalidCurrentPasswordError,
  changePassword,
  createUser,
  updateProfile,
  verifyCredentials,
} from "./auth-service"

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } })
    createdIds.length = 0
  }
})

describe("createUser", () => {
  it("creates a user with a hashed password", async () => {
    const email = `svc-test-${Date.now()}@example.com`
    const user = await createUser({ name: "Svc Test", email, password: "Password123" })
    createdIds.push(user.id)

    expect(user.hashedPassword).not.toBe("Password123")
  })

  it("rejects a duplicate email", async () => {
    const email = `svc-test-${Date.now()}-dup@example.com`
    const first = await createUser({ name: "First", email, password: "Password123" })
    createdIds.push(first.id)

    await expect(
      createUser({ name: "Second", email, password: "Password123" })
    ).rejects.toBeInstanceOf(EmailAlreadyExistsError)
  })
})

describe("verifyCredentials", () => {
  it("returns the user for correct credentials", async () => {
    const email = `svc-test-${Date.now()}-verify@example.com`
    const created = await createUser({ name: "Verify", email, password: "Password123" })
    createdIds.push(created.id)

    const result = await verifyCredentials(email, "Password123")
    expect(result?.id).toBe(created.id)
  })

  it("returns null for an incorrect password", async () => {
    const email = `svc-test-${Date.now()}-wrongpw@example.com`
    const created = await createUser({ name: "WrongPw", email, password: "Password123" })
    createdIds.push(created.id)

    const result = await verifyCredentials(email, "WrongPassword1")
    expect(result).toBeNull()
  })

  it("returns null for an unknown email", async () => {
    const result = await verifyCredentials("nobody@example.com", "Password123")
    expect(result).toBeNull()
  })
})

describe("updateProfile", () => {
  it("updates the user's name", async () => {
    const email = `svc-test-${Date.now()}-profile@example.com`
    const created = await createUser({ name: "Before", email, password: "Password123" })
    createdIds.push(created.id)

    const updated = await updateProfile(created.id, "After")
    expect(updated.name).toBe("After")
  })
})

describe("changePassword", () => {
  it("changes the password when the current password is correct", async () => {
    const email = `svc-test-${Date.now()}-changepw@example.com`
    const created = await createUser({ name: "ChangePw", email, password: "Password123" })
    createdIds.push(created.id)

    await changePassword(created.id, "Password123", "NewPassword1")
    const result = await verifyCredentials(email, "NewPassword1")
    expect(result?.id).toBe(created.id)
  })

  it("rejects an incorrect current password", async () => {
    const email = `svc-test-${Date.now()}-badcurrent@example.com`
    const created = await createUser({ name: "BadCurrent", email, password: "Password123" })
    createdIds.push(created.id)

    await expect(
      changePassword(created.id, "WrongCurrent1", "NewPassword1")
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/services/auth-service.test.ts`
Expected: FAIL — module `./auth-service` does not exist.

- [ ] **Step 3: Implement**

Create `src/server/services/auth-service.ts`:
```ts
import * as userRepository from "@/server/repositories/user-repository"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import type { User } from "@prisma/client"

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("An account with this email already exists")
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super("Current password is incorrect")
  }
}

export async function createUser(input: {
  name: string
  email: string
  password: string
}): Promise<User> {
  const existing = await userRepository.findByEmail(input.email)
  if (existing) throw new EmailAlreadyExistsError()

  const hashedPassword = await hashPassword(input.password)
  return userRepository.create({
    name: input.name,
    email: input.email,
    hashedPassword,
  })
}

export async function verifyCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const user = await userRepository.findByEmail(email)
  if (!user) return null

  const valid = await verifyPassword(password, user.hashedPassword)
  if (!valid) return null

  return user
}

export async function updateProfile(userId: string, name: string): Promise<User> {
  return userRepository.updateName(userId, name)
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<User> {
  const user = await userRepository.findById(userId)
  if (!user) throw new Error("User not found")

  const valid = await verifyPassword(currentPassword, user.hashedPassword)
  if (!valid) throw new InvalidCurrentPasswordError()

  const hashedPassword = await hashPassword(newPassword)
  return userRepository.updatePassword(userId, hashedPassword)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/services/auth-service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services
git commit -m "feat: add auth service with tests"
```

---

### Task 8: Auth.js v5 configuration and route handler

**Files:**
- Create: `src/lib/auth/auth.ts`, `src/types/next-auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Consumes: `verifyCredentials` (Task 7).
- Produces from `@/lib/auth/auth`: `handlers`, `signIn`, `signOut`, `auth` (all from `NextAuth(...)`).

- [ ] **Step 1: Install Auth.js v5**

Run: `pnpm add next-auth@beta`

- [ ] **Step 2: Generate AUTH_SECRET**

Run: `pnpm dlx auth secret` (or `openssl rand -base64 33`) and paste the value into `.env` as `AUTH_SECRET="..."`. Add the same key (empty) to `.env.example` (already present from Task 3).

- [ ] **Step 3: Add the session type augmentation**

Create `src/types/next-auth.d.ts`:
```ts
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
  }
}
```

- [ ] **Step 4: Write the Auth.js config**

Create `src/lib/auth/auth.ts`:
```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { verifyCredentials } from "@/server/services/auth-service"

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== "string" || typeof password !== "string") {
          return null
        }
        const user = await verifyCredentials(email, password)
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email, image: user.image }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.sub = user.id
      return token
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})
```

- [ ] **Step 5: Add the API route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/lib/auth/auth"

export const { GET, POST } = handlers
```

- [ ] **Step 6: Verify**

Run: `pnpm dev` (in background), then: `curl -s http://localhost:3000/api/auth/providers`
Expected: JSON response listing a `credentials` provider. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/auth.ts src/types/next-auth.d.ts src/app/api/auth
git commit -m "feat: configure Auth.js v5 with Credentials provider"
```

---

### Task 9: Middleware for protected routes

**Files:**
- Create: `middleware.ts` (repo root, next to `package.json`)

**Interfaces:**
- Consumes: `auth` (Task 8).

- [ ] **Step 1: Write the middleware**

Create `middleware.ts`:
```ts
import { auth } from "@/lib/auth/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute =
    req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/settings")

  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*"],
}
```

- [ ] **Step 2: Verify**

Run: `pnpm dev` (background), then: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard`
Expected: a redirect status (307/302) with `redirect_url` pointing to `/login?callbackUrl=%2Fdashboard`. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect /dashboard and /settings via middleware"
```

---

### Task 10: Signup page, form, and server action

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/signup-form.tsx`, `src/app/(auth)/signup/actions.ts`

**Interfaces:**
- Consumes: `signupSchema`/`SignupInput` (Task 5), `createUser`/`EmailAlreadyExistsError` (Task 7), `signIn` (Task 8).
- Produces: `signupAction(input: unknown): Promise<{ success: true } | { success: false; fieldErrors?: Record<string, string[]>; formError?: string }>` from `./actions`.

- [ ] **Step 1: Create the shared auth layout**

Create `src/app/(auth)/layout.tsx` — a centered card layout; also bounces already-authenticated users straight to `/dashboard` so a logged-in user can't land on `/login` or `/signup`:
```tsx
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Write the server action**

Create `src/app/(auth)/signup/actions.ts`:
```ts
"use server"

import { signupSchema } from "@/server/validators/auth-schemas"
import { EmailAlreadyExistsError, createUser } from "@/server/services/auth-service"
import { signIn } from "@/lib/auth/auth"

export type SignupResult =
  | { success: true }
  | { success: false; fieldErrors?: Record<string, string[] | undefined>; formError?: string }

export async function signupAction(input: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createUser(parsed.data)
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return { success: false, fieldErrors: { email: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  })

  return { success: true }
}
```

- [ ] **Step 3: Write the client form**

Create `src/app/(auth)/signup/signup-form.tsx`:
```tsx
"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { signupSchema, type SignupInput } from "@/server/validators/auth-schemas"
import { signupAction } from "./actions"

export function SignupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  })

  function onSubmit(values: SignupInput) {
    startTransition(async () => {
      const result = await signupAction(values)
      if (result.success) {
        router.push("/dashboard")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            form.setError(field as keyof SignupInput, { message: messages[0] })
          }
        }
      }
      if (result.formError) {
        toast.error(result.formError)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating account…" : "Sign up"}
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 4: Write the page**

Create `src/app/(auth)/signup/page.tsx`:
```tsx
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignupForm } from "./signup-form"

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Install the RHF/Zod resolver**

Run: `pnpm add react-hook-form @hookform/resolvers`

- [ ] **Step 6: Verify manually**

Run `pnpm dev`, visit `http://localhost:3000/signup`, submit valid data, confirm redirect to `/dashboard` (it will 404 or render minimally until Task 14 — that's expected at this point; confirm the redirect itself happens and no error toast fires). Submit the same email again and confirm the "email already exists" field error appears under Email. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(auth\) package.json pnpm-lock.yaml
git commit -m "feat: add signup page, form, and server action"
```

---

### Task 11: Login page, form, and server action

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/login/actions.ts`

**Interfaces:**
- Consumes: `loginSchema`/`LoginInput` (Task 5), `signIn` (Task 8).
- Produces: `loginAction(input: unknown): Promise<{ success: true } | { success: false; formError: string }>` from `./actions`.

- [ ] **Step 1: Write the server action**

Create `src/app/(auth)/login/actions.ts`:
```ts
"use server"

import { AuthError } from "next-auth"
import { loginSchema } from "@/server/validators/auth-schemas"
import { signIn } from "@/lib/auth/auth"

export type LoginResult = { success: true } | { success: false; formError: string }

export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Enter a valid email and password." }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, formError: "Invalid email or password." }
    }
    throw error
  }
}
```

- [ ] **Step 2: Write the client form**

Create `src/app/(auth)/login/login-form.tsx`:
```tsx
"use client"

import { useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { loginSchema, type LoginInput } from "@/server/validators/auth-schemas"
import { loginAction } from "./actions"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const result = await loginAction(values)
      if (result.success) {
        router.push(searchParams.get("callbackUrl") ?? "/dashboard")
        return
      }
      toast.error(result.formError)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(auth)/login/page.tsx`:
```tsx
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Verify manually**

Run `pnpm dev`, visit `/login`, submit a wrong password for the account created in Task 10 and confirm the generic "Invalid email or password." toast (not a field error, and not revealing whether the email exists). Then log in with the correct password and confirm redirect. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/login
git commit -m "feat: add login page, form, and server action"
```

---

### Task 12: App shell — sidebar, topbar, user menu

**Files:**
- Create: `src/config/site.ts`, `src/components/layout/app-shell.tsx`, `src/components/layout/sidebar-nav.tsx`, `src/components/layout/topbar.tsx`, `src/components/layout/user-menu.tsx`, `src/components/layout/sign-out-button.tsx`

**Interfaces:**
- Consumes: `auth` (Task 8), shadcn `Sidebar*`/`DropdownMenu*`/`Avatar*`/`Breadcrumb*` primitives (Task 2).
- Produces: `siteNav: { title: string; href: string; icon: LucideIcon }[]` from `@/config/site`; `AppShell({ user, children }: { user: { name: string | null; email: string; image: string | null }; children: React.ReactNode })` default export from `@/components/layout/app-shell`.

- [ ] **Step 1: Define the nav data**

Create `src/config/site.ts`:
```ts
import { LayoutDashboard, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const siteNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Settings", href: "/settings", icon: Settings },
]
```
Each future phase appends its module here — the sidebar component itself never changes to add an item.

- [ ] **Step 2: Sign-out server action + button**

Create `src/components/layout/sign-out-button.tsx`:
```tsx
import { signOut } from "@/lib/auth/auth"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/login" })
      }}
      className="w-full"
    >
      <DropdownMenuItem asChild>
        <button type="submit" className="w-full text-left">
          Sign out
        </button>
      </DropdownMenuItem>
    </form>
  )
}
```

- [ ] **Step 3: Sidebar navigation**

Create `src/components/layout/sidebar-nav.tsx`:
```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { siteNav } from "@/config/site"

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <SidebarMenu>
      {siteNav.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
            <Link href={item.href}>
              <item.icon />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
```

- [ ] **Step 4: User menu**

Create `src/components/layout/user-menu.tsx`:
```tsx
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SignOutButton } from "./sign-out-button"

export function UserMenu({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="User menu" className="rounded-full">
        <Avatar>
          {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{user.name ?? "Unnamed"}</span>
            <span className="text-muted-foreground text-xs">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 5: Topbar**

Create `src/components/layout/topbar.tsx`:
```tsx
import { SidebarTrigger } from "@/components/ui/sidebar"
import { UserMenu } from "./user-menu"

export function Topbar({
  title,
  user,
}: {
  title: string
  user: { name: string | null; email: string; image: string | null }
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <span className="font-medium">{title}</span>
      </div>
      <UserMenu user={user} />
    </header>
  )
}
```

- [ ] **Step 6: App shell**

Create `src/components/layout/app-shell.tsx`:
```tsx
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { SidebarNav } from "./sidebar-nav"
import { Topbar } from "./topbar"

export function AppShell({
  title,
  user,
  children,
}: {
  title: string
  user: { name: string | null; email: string; image: string | null }
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 font-semibold">ManageMe</SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <Topbar title={title} user={user} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 7: Verify**

Run: `pnpm build`
Expected: build succeeds (pages consuming `AppShell` don't exist until Task 13, so this is a type/compile check on the shell components in isolation — no runtime error is possible yet without a consumer; treat a clean `tsc`/build as the pass condition for this task).

- [ ] **Step 8: Commit**

```bash
git add src/config src/components/layout
git commit -m "feat: add app shell with sidebar, topbar, and user menu"
```

---

### Task 13: Root layout wiring and the `(app)` route group

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `auth` (Task 8), `AppShell` (Task 12).

- [ ] **Step 1: Root page redirect**

Replace `src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"

export default async function Home() {
  const session = await auth()
  redirect(session ? "/dashboard" : "/login")
}
```

- [ ] **Step 2: `(app)` layout wrapping AppShell**

Create `src/app/(app)/layout.tsx`. Session is resolved server-side here before any HTML is sent, so there is no client-side "resolving session" flash to cover with a skeleton — middleware (Task 9) already guarantees a session exists for these routes, but this layout still reads it (never trusts middleware alone) to pass real user data into `AppShell`:
```tsx
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <AppShell
      title="ManageMe"
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        image: session.user.image ?? null,
      }}
    >
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: wire root redirect and authenticated route group layout"
```

---

### Task 14: Dashboard page

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/loading.tsx`

**Interfaces:**
- Consumes: `auth` (Task 8).

- [ ] **Step 1: Write the page**

Create `src/app/(app)/dashboard/page.tsx`:
```tsx
import { auth } from "@/lib/auth/auth"

export default async function DashboardPage() {
  const session = await auth()
  const name = session?.user?.name ?? session?.user?.email ?? "there"

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {name}</h1>
      <p className="text-muted-foreground mt-2">
        Your applications, resumes, and tasks will show up here as you add them.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Loading skeleton for navigation transitions**

Create `src/app/(app)/dashboard/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

Run `pnpm dev`, log in, confirm `/dashboard` shows "Welcome, <your name>" and the sidebar shows only Dashboard/Settings. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/dashboard
git commit -m "feat: add dashboard landing page"
```

---

### Task 15: Settings page — profile, password, appearance

**Files:**
- Create: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/loading.tsx`, `src/app/(app)/settings/profile-form.tsx`, `src/app/(app)/settings/password-form.tsx`, `src/app/(app)/settings/appearance-form.tsx`, `src/app/(app)/settings/actions.ts`

**Interfaces:**
- Consumes: `auth` (Task 8), `updateProfileSchema`/`changePasswordSchema` (Task 5), `updateProfile`/`changePassword`/`InvalidCurrentPasswordError` (Task 7).
- Produces: `updateProfileAction`, `changePasswordAction` from `./actions`.

- [ ] **Step 1: Server actions — derive the user id from the session, never from client input**

Create `src/app/(app)/settings/actions.ts`:
```ts
"use server"

import { auth } from "@/lib/auth/auth"
import {
  changePasswordSchema,
  updateProfileSchema,
} from "@/server/validators/auth-schemas"
import {
  InvalidCurrentPasswordError,
  changePassword,
  updateProfile,
} from "@/server/services/auth-service"

type ActionResult =
  | { success: true }
  | { success: false; fieldErrors?: Record<string, string[] | undefined>; formError?: string }

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  await updateProfile(session.user.id, parsed.data.name)
  return { success: true }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword)
    return { success: true }
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) {
      return { success: false, fieldErrors: { currentPassword: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}
```

- [ ] **Step 2: Profile form**

Create `src/app/(app)/settings/profile-form.tsx`:
```tsx
"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/server/validators/auth-schemas"
import { updateProfileAction } from "./actions"

export function ProfileForm({ defaultName }: { defaultName: string }) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: defaultName },
  })

  function onSubmit(values: UpdateProfileInput) {
    startTransition(async () => {
      const result = await updateProfileAction(values)
      if (result.success) {
        toast.success("Profile updated.")
        return
      }
      if (result.fieldErrors?.name?.[0]) {
        form.setError("name", { message: result.fieldErrors.name[0] })
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 3: Password form**

Create `src/app/(app)/settings/password-form.tsx`:
```tsx
"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/server/validators/auth-schemas"
import { changePasswordAction } from "./actions"

export function PasswordForm() {
  const [isPending, startTransition] = useTransition()
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  })

  function onSubmit(values: ChangePasswordInput) {
    startTransition(async () => {
      const result = await changePasswordAction(values)
      if (result.success) {
        toast.success("Password changed.")
        form.reset()
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            form.setError(field as keyof ChangePasswordInput, { message: messages[0] })
          }
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 4: Appearance form**

Create `src/app/(app)/settings/appearance-form.tsx`:
```tsx
"use client"

import { useTheme } from "next-themes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export function AppearanceForm() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Theme: {theme ?? "system"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 5: Settings page**

Create `src/app/(app)/settings/page.tsx`:
```tsx
import { auth } from "@/lib/auth/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileForm } from "./profile-form"
import { PasswordForm } from "./password-form"
import { AppearanceForm } from "./appearance-form"

export default async function SettingsPage() {
  const session = await auth()

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultName={session?.user?.name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceForm />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Loading skeleton**

Create `src/app/(app)/settings/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="max-w-lg space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
```

- [ ] **Step 7: Verify manually**

Run `pnpm dev`, log in, go to `/settings`: change the name and confirm the toast + persisted change (reload the page); change the password with a wrong current password and confirm the field error; change it correctly, log out, and log back in with the new password. Toggle the theme and confirm it persists across reload. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/settings
git commit -m "feat: add settings page with profile, password, and appearance forms"
```

---

### Task 16: End-to-end auth flow test

**Files:**
- Create: `playwright.config.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: the running application (signup, login, dashboard, sign-out) built in Tasks 10–15.

- [ ] **Step 1: Install Playwright**

Run: `pnpm dlx create-playwright@latest --quiet --no-examples` or, if that prompts unavoidably: `pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium`

- [ ] **Step 2: Write the config**

Create `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
})
```

- [ ] **Step 3: Write the failing test**

Create `e2e/auth.spec.ts`:
```ts
import { test, expect } from "@playwright/test"

test("signup, dashboard, logout, login, logout", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`
  const password = "Password123"
  const name = "E2E Test User"

  await page.goto("/signup")
  await page.getByLabel("Name").fill(name)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign up" }).click()

  await expect(page).toHaveURL("/dashboard")
  await expect(page.getByText(`Welcome, ${name}`)).toBeVisible()

  await page.getByRole("button", { name: "User menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL("/login")

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Log in" }).click()
  await expect(page).toHaveURL("/dashboard")

  await page.getByRole("button", { name: "User menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL("/login")
})
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm exec playwright test`
Expected: 1 passed. If the `User menu` accessible name doesn't match, check `DropdownMenuTrigger`'s `aria-label="User menu"` in `user-menu.tsx` (Task 12) — that's what this selector depends on.

- [ ] **Step 5: Add the test script and commit**

Add to `package.json` `"scripts"`: `"test:e2e": "playwright test"`.

```bash
git add playwright.config.ts e2e package.json pnpm-lock.yaml
git commit -m "test: add end-to-end auth flow spec"
```

---

### Task 17: Environment docs and README

**Files:**
- Modify: `README.md`, `.env.example` (verify complete)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write the README**

Replace `README.md`:
```markdown
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

Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma ·
PostgreSQL · Auth.js v5 · Vitest · Playwright
```

- [ ] **Step 2: Verify `.env.example` is complete**

Confirm it lists `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` with no real secrets.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add README with local setup instructions"
```

---

## Self-Review Notes

- **Spec coverage:** every §-numbered section of the design spec maps to a task — stack (§4→Tasks 1-3,8,16), architecture/layering (§5→Tasks 6-8,10-11,15), schema (§6→Task 3), pages/flows (§7→Tasks 10,11,14,15), auth design (§8→Tasks 8-9), design system (§9→Task 2), shell/nav (§10→Tasks 12-13), cross-cutting validation/errors/loading/testing/env (§11→woven into Tasks 10,11,14,15,16,3/8/17).
- **Placeholder scan:** no TBD/TODO markers; every step shows real code, not a description of code.
- **Type consistency:** `hashPassword`/`verifyPassword` (Task 4) → used identically in Task 7's `auth-service.ts`. `findByEmail`/`findById`/`create`/`updateName`/`updatePassword` (Task 6) → called with matching names/args in Task 7. `createUser`/`verifyCredentials`/`updateProfile`/`changePassword`/`EmailAlreadyExistsError`/`InvalidCurrentPasswordError` (Task 7) → imported and used identically in Tasks 8, 10, 15. `signIn`/`signOut`/`auth`/`handlers` (Task 8) → consumed identically in Tasks 9, 10, 11, 13, 14, 15, and `sign-out-button.tsx`. `siteNav` (Task 12) consumed only by `sidebar-nav.tsx`, matching its declared shape.

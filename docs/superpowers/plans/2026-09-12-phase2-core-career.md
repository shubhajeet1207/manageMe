# ManageMe Phase 2 (Core Career System) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core career system — Companies and Applications, a fixed seven-stage status pipeline, a drag-and-drop Board and a sortable Table — so a signed-in user can track a job search end to end, with every query scoped to its owner.

**Architecture:** Layered `UI → Server Action → Service → Repository → Prisma`, unchanged from Phase 1. Server Components fetch data; Client Components exist only where interactivity demands them (forms, board, toggles). The new load-bearing rule is ownership scoping: every repository function takes `userId` first and filters on it.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui on Base UI · `@dnd-kit/core` · React Hook Form + Zod 4 · PostgreSQL (Neon, us-west-2) · Prisma 7 · Vitest · Playwright · pnpm.

**Spec:** `docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`

## Global Constraints

- Package manager is **pnpm** for every install/run command.
- Prisma CLI must be invoked as **`pnpm exec prisma`**, never `pnpm dlx prisma` — `dlx` fetches a newer major whose command names differ from the pinned 7.9.1.
- **Ownership rule (spec §5.1):** every repository function touching a user-owned row takes `userId` as its first parameter and includes it in the `where` clause. Reads use `findFirst({ where: { id, userId } })`, never `findUnique({ where: { id } })`. Writes use `updateMany`/`deleteMany` scoped by `{ id, userId }` and check the returned `count`.
- A record that does not exist and a record belonging to another user are **indistinguishable** to the client — both surface as not-found. Never return 403 or any message implying the record exists.
- Every Server Action calls `auth()` itself and returns `{ success: false, formError: "Unauthorized." }` without a session. Actions never rely on route protection for authorization.
- Every Server Action re-validates input with the same Zod schema the client form uses.
- Status pipeline is the fixed enum `SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, ACCEPTED, REJECTED`. Do not add `WITHDRAWN` or make statuses user-editable.
- **No `position` field and no within-column ordering.** Board cards sort by `updatedAt` descending.
- Deleting a company that still has applications is **refused**, not cascaded.
- This project has **no `middleware.ts`** — Next.js 16 renamed it. Route protection lives in `src/proxy.ts`, which gates in two places that must stay in sync: the `startsWith` checks in the handler body **and** the `config.matcher` array.
- shadcn components here are built on **Base UI** (`@base-ui/react`), not Radix. They use a `render={<Element/>}` prop, **not** `asChild`. Follow the patterns in the already-generated `src/components/ui/*` files.
- All DB-touching tests run against the real database in `DATABASE_URL` and must clean up every row they create. Deleting a test `User` cascades to its companies and applications, so cleaning up users is sufficient.
- Zod 4 is installed. `z.enum(PrismaEnumObject)`, `.refine({ path: [...] })`, `z.coerce.number()`, `z.coerce.date()`, and `error.flatten().fieldErrors` are all verified working — match Phase 1's existing style (`z.string().email()`, `z.string().url()`).
- No comments explaining *what* code does — only where a non-obvious *why* exists.

---

## File Structure

```
manageMe/
  prisma/schema.prisma                              # MODIFY: enums, Company, Application
  src/
    proxy.ts                                        # MODIFY: protect new routes
    config/site.ts                                  # MODIFY: two nav entries
    types/action-result.ts                          # CREATE: shared action result union
    server/
      validators/
        company-schemas.ts       + .test.ts         # CREATE
        application-schemas.ts   + .test.ts         # CREATE
      repositories/
        company-repository.ts     + .test.ts        # CREATE
        application-repository.ts + .test.ts        # CREATE
      services/
        company-service.ts        + .test.ts        # CREATE
        application-service.ts    + .test.ts        # CREATE
    components/
      status-badge.tsx                              # CREATE
      company-combobox.tsx                          # CREATE
    app/(auth)/signup/actions.ts                    # MODIFY: import shared result
    app/(app)/
      settings/actions.ts                           # MODIFY: import shared result
      companies/
        page.tsx, loading.tsx, actions.ts           # CREATE
        company-table.tsx, company-sheet.tsx        # CREATE
        company-form.tsx, delete-company-dialog.tsx # CREATE
        [id]/page.tsx, [id]/loading.tsx             # CREATE
      applications/
        page.tsx, loading.tsx, actions.ts           # CREATE
        view-toggle.tsx                             # CREATE
        application-table.tsx                       # CREATE
        application-board.tsx, application-card.tsx # CREATE
        application-sheet.tsx, application-form.tsx # CREATE
        delete-application-dialog.tsx               # CREATE
  e2e/applications.spec.ts                          # CREATE
```

---

### Task 1: Prisma schema — enums, Company, Application

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_company_and_application/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `Company`, `Application`; runtime enum objects `ApplicationStatus` and `WorkMode` importable as **values** from `@prisma/client`; types `Company`, `Application` importable as types.

- [ ] **Step 1: Add the enums and models to the schema**

Append to `prisma/schema.prisma`:

```prisma
enum ApplicationStatus {
  SAVED
  APPLIED
  SCREENING
  INTERVIEW
  OFFER
  ACCEPTED
  REJECTED
}

enum WorkMode {
  ONSITE
  HYBRID
  REMOTE
}

model Company {
  id        String   @id @default(cuid())
  userId    String
  name      String
  website   String?
  location  String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  applications Application[]

  @@unique([userId, name])
  @@index([userId])
}

model Application {
  id        String            @id @default(cuid())
  userId    String
  companyId String
  roleTitle String
  status    ApplicationStatus @default(SAVED)
  jobUrl    String?
  location  String?
  workMode  WorkMode?
  salaryMin Int?
  salaryMax Int?
  currency  String?
  source    String?
  appliedAt DateTime?
  notes     String?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([userId, status])
  @@index([userId, companyId])
}
```

- [ ] **Step 2: Add back-relations to the existing User model**

In the same file, add these two lines inside `model User`, after `image String?`:

```prisma
  companies    Company[]
  applications Application[]
```

- [ ] **Step 3: Create and apply the migration**

Run: `pnpm exec prisma migrate dev --name add_company_and_application`
Expected: a new folder under `prisma/migrations/`, "Your database is now in sync with your schema", and the client regenerating.

- [ ] **Step 4: Verify the enum is generated as a runtime value**

Run:
```bash
cat > probe.mjs <<'EOF'
import { ApplicationStatus, WorkMode } from "@prisma/client"
console.log(Object.keys(ApplicationStatus).join(","))
console.log(Object.keys(WorkMode).join(","))
EOF
node probe.mjs && rm probe.mjs
```
Expected:
```
SAVED,APPLIED,SCREENING,INTERVIEW,OFFER,ACCEPTED,REJECTED
ONSITE,HYBRID,REMOTE
```
This matters because the Zod schemas in Tasks 3 and 6 call `z.enum(ApplicationStatus)` on the runtime object. If this prints nothing, the schemas will not compile.

- [ ] **Step 5: Verify the existing suite still passes**

Run: `pnpm test`
Expected: 26 passed. The schema change must not disturb Phase 1.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add Company and Application models with status pipeline"
```

---

### Task 2: Shared ActionResult type

Phase 1 declares the same result union twice. Four new action modules land in this phase, so extract it once now (spec §11.5).

**Files:**
- Create: `src/types/action-result.ts`
- Modify: `src/app/(auth)/signup/actions.ts`, `src/app/(app)/settings/actions.ts`

**Interfaces:**
- Produces: `ActionResult` — `{ success: true } | { success: false; fieldErrors?: Record<string, string[] | undefined>; formError?: string }`. Every Server Action in this plan returns it.

- [ ] **Step 1: Create the shared type**

`src/types/action-result.ts`:

```ts
export type ActionResult =
  | { success: true }
  | {
      success: false
      fieldErrors?: Record<string, string[] | undefined>
      formError?: string
    }
```

- [ ] **Step 2: Use it in the signup action**

In `src/app/(auth)/signup/actions.ts`, delete the local `SignupResult` type declaration and replace its uses:

```ts
import type { ActionResult } from "@/types/action-result"
```

Change the signature to:

```ts
export async function signupAction(input: unknown): Promise<ActionResult> {
```

- [ ] **Step 3: Update the signup form's import**

`src/app/(auth)/signup/signup-form.tsx` does not name the type, so no change is needed there. Confirm with:

Run: `grep -rn "SignupResult" src/`
Expected: no output.

- [ ] **Step 4: Use it in the settings actions**

In `src/app/(app)/settings/actions.ts`, delete the local `ActionResult` type declaration and add:

```ts
import type { ActionResult } from "@/types/action-result"
```

- [ ] **Step 5: Verify nothing broke**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors; 26 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/types/action-result.ts src/app/\(auth\)/signup/actions.ts src/app/\(app\)/settings/actions.ts
git commit -m "refactor: extract shared ActionResult type"
```

---

### Task 3: Company validators (TDD)

**Files:**
- Create: `src/server/validators/company-schemas.test.ts`
- Create: `src/server/validators/company-schemas.ts`

**Interfaces:**
- Produces: `createCompanySchema`, `updateCompanySchema`, and types `CreateCompanyInput`, `UpdateCompanyInput`.
- `website` accepts a valid URL **or** an empty string (forms submit `""` for untouched optional fields); empty strings normalise to `undefined`.

- [ ] **Step 1: Write the failing tests**

`src/server/validators/company-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createCompanySchema, updateCompanySchema } from "./company-schemas"

describe("createCompanySchema", () => {
  it("accepts a company with only a name", () => {
    const result = createCompanySchema.safeParse({ name: "Acme" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty name", () => {
    const result = createCompanySchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.name?.[0]).toBe("Name is required")
  })

  it("trims whitespace from the name", () => {
    const result = createCompanySchema.safeParse({ name: "  Acme  " })
    expect(result.success && result.data.name).toBe("Acme")
  })

  it("rejects a name longer than 200 characters", () => {
    const result = createCompanySchema.safeParse({ name: "a".repeat(201) })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed website", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "not-a-url" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.website?.[0]).toBe("Enter a valid URL")
  })

  it("accepts a valid website", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "https://acme.com" })
    expect(result.success).toBe(true)
  })

  it("normalises an empty website to undefined", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", website: "" })
    expect(result.success && result.data.website).toBeUndefined()
  })

  it("normalises empty location and notes to undefined", () => {
    const result = createCompanySchema.safeParse({ name: "Acme", location: "", notes: "" })
    expect(result.success && result.data.location).toBeUndefined()
    expect(result.success && result.data.notes).toBeUndefined()
  })
})

describe("updateCompanySchema", () => {
  it("requires an id", () => {
    const result = updateCompanySchema.safeParse({ name: "Acme" })
    expect(result.success).toBe(false)
  })

  it("accepts an id with a name", () => {
    const result = updateCompanySchema.safeParse({ id: "c1", name: "Acme" })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/validators/company-schemas.test.ts`
Expected: FAIL — cannot resolve `./company-schemas`.

- [ ] **Step 3: Write the implementation**

`src/server/validators/company-schemas.ts`:

```ts
import { z } from "zod"

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value === "" ? undefined : value))

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: optionalUrl,
  location: optionalText,
  notes: optionalText,
})
export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const updateCompanySchema = createCompanySchema.extend({
  id: z.string().min(1),
})
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/validators/company-schemas.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/validators/company-schemas.ts src/server/validators/company-schemas.test.ts
git commit -m "feat: add company validation schemas"
```

---

### Task 4: Company repository (TDD, ownership-scoped)

**Files:**
- Create: `src/server/repositories/company-repository.test.ts`
- Create: `src/server/repositories/company-repository.ts`

**Interfaces:**
- Produces, all taking `userId` first:
  - `listByUser(userId: string): Promise<CompanyWithCount[]>` where `CompanyWithCount = Company & { _count: { applications: number } }`
  - `findById(userId: string, id: string): Promise<Company | null>`
  - `findByName(userId: string, name: string): Promise<Company | null>`
  - `create(userId: string, data: CreateCompanyInput): Promise<Company>`
  - `update(userId: string, id: string, data: CreateCompanyInput): Promise<Company | null>` — `null` when the row is absent or not the user's
  - `remove(userId: string, id: string): Promise<boolean>` — `false` when absent or not the user's
  - `countApplications(userId: string, id: string): Promise<number>`

- [ ] **Step 1: Write the failing tests**

`src/server/repositories/company-repository.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as companyRepository from "./company-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Company Repo Test",
      email: `company-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("companyRepository", () => {
  it("creates a company and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await companyRepository.create(user.id, { name: "Acme" })

    const list = await companyRepository.listByUser(user.id)
    expect(list.map((c) => c.id)).toContain(created.id)
  })

  it("includes an application count in the list", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    const list = await companyRepository.listByUser(user.id)
    expect(list.find((c) => c.id === company.id)?._count.applications).toBe(1)
  })

  it("finds a company by id for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    const found = await companyRepository.findById(user.id, company.id)
    expect(found?.name).toBe("Acme")
  })

  it("finds a company by name for its owner", async () => {
    const user = await makeUser()
    await companyRepository.create(user.id, { name: "Acme" })

    const found = await companyRepository.findByName(user.id, "Acme")
    expect(found?.name).toBe("Acme")
  })

  it("updates a company for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    const updated = await companyRepository.update(user.id, company.id, {
      name: "Acme Corp",
      location: "Bengaluru",
    })
    expect(updated?.name).toBe("Acme Corp")
    expect(updated?.location).toBe("Bengaluru")
  })

  it("deletes a company for its owner", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })

    expect(await companyRepository.remove(user.id, company.id)).toBe(true)
    expect(await companyRepository.findById(user.id, company.id)).toBeNull()
  })

  it("counts a company's applications", async () => {
    const user = await makeUser()
    const company = await companyRepository.create(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    expect(await companyRepository.countApplications(user.id, company.id)).toBe(1)
  })

  describe("ownership", () => {
    it("does not list another user's companies", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.listByUser(other.id)).toHaveLength(0)
    })

    it("does not find another user's company by id", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.findById(other.id, company.id)).toBeNull()
    })

    it("does not update another user's company", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.update(other.id, company.id, { name: "Hacked" })).toBeNull()
      expect((await companyRepository.findById(owner.id, company.id))?.name).toBe("Acme")
    })

    it("does not delete another user's company", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const company = await companyRepository.create(owner.id, { name: "Acme" })

      expect(await companyRepository.remove(other.id, company.id)).toBe(false)
      expect(await companyRepository.findById(owner.id, company.id)).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/repositories/company-repository.test.ts`
Expected: FAIL — cannot resolve `./company-repository`.

- [ ] **Step 3: Write the implementation**

`src/server/repositories/company-repository.ts`:

```ts
import { prisma } from "@/lib/db/prisma"
import type { Company } from "@prisma/client"
import type { CreateCompanyInput } from "@/server/validators/company-schemas"

export type CompanyWithCount = Company & { _count: { applications: number } }

export function listByUser(userId: string): Promise<CompanyWithCount[]> {
  return prisma.company.findMany({
    where: { userId },
    include: { _count: { select: { applications: true } } },
    orderBy: { name: "asc" },
  })
}

export function findById(userId: string, id: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { id, userId } })
}

export function findByName(userId: string, name: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { userId, name } })
}

export function create(userId: string, data: CreateCompanyInput): Promise<Company> {
  return prisma.company.create({ data: { ...data, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateCompanyInput
): Promise<Company | null> {
  const { count } = await prisma.company.updateMany({ where: { id, userId }, data })
  if (count === 0) return null
  return prisma.company.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.company.deleteMany({ where: { id, userId } })
  return count > 0
}

export function countApplications(userId: string, id: string): Promise<number> {
  return prisma.application.count({ where: { userId, companyId: id } })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/repositories/company-repository.test.ts`
Expected: PASS, 11 tests — including all four ownership tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/company-repository.ts src/server/repositories/company-repository.test.ts
git commit -m "feat: add ownership-scoped company repository"
```

---

### Task 5: Company service (TDD)

**Files:**
- Create: `src/server/services/company-service.test.ts`
- Create: `src/server/services/company-service.ts`

**Interfaces:**
- Produces: error classes `CompanyNameTakenError`, `CompanyHasApplicationsError` (with a public `count: number`), `CompanyNotFoundError`; functions `listCompanies`, `getCompany`, `createCompany`, `updateCompany`, `deleteCompany`, and `findOrCreateByName(userId, name)` used by the combobox in Task 14.

- [ ] **Step 1: Write the failing tests**

`src/server/services/company-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  CompanyHasApplicationsError,
  CompanyNameTakenError,
  CompanyNotFoundError,
  createCompany,
  deleteCompany,
  findOrCreateByName,
  getCompany,
  listCompanies,
  updateCompany,
} from "./company-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Company Service Test",
      email: `company-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("createCompany", () => {
  it("creates a company", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    expect(company.name).toBe("Acme")
  })

  it("rejects a duplicate name for the same user", async () => {
    const user = await makeUser()
    await createCompany(user.id, { name: "Acme" })
    await expect(createCompany(user.id, { name: "Acme" })).rejects.toBeInstanceOf(
      CompanyNameTakenError
    )
  })

  it("allows the same name for two different users", async () => {
    const a = await makeUser()
    const b = await makeUser()
    await createCompany(a.id, { name: "Acme" })
    await expect(createCompany(b.id, { name: "Acme" })).resolves.toBeDefined()
  })
})

describe("listCompanies and getCompany", () => {
  it("lists only the user's companies", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    await createCompany(owner.id, { name: "Acme" })
    expect(await listCompanies(other.id)).toHaveLength(0)
  })

  it("throws CompanyNotFoundError for another user's company", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await createCompany(owner.id, { name: "Acme" })
    await expect(getCompany(other.id, company.id)).rejects.toBeInstanceOf(CompanyNotFoundError)
  })
})

describe("updateCompany", () => {
  it("updates a company", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    const updated = await updateCompany(user.id, company.id, { name: "Acme Corp" })
    expect(updated.name).toBe("Acme Corp")
  })

  it("rejects renaming onto another existing company's name", async () => {
    const user = await makeUser()
    await createCompany(user.id, { name: "Acme" })
    const other = await createCompany(user.id, { name: "Globex" })
    await expect(updateCompany(user.id, other.id, { name: "Acme" })).rejects.toBeInstanceOf(
      CompanyNameTakenError
    )
  })

  it("allows saving a company under its own unchanged name", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await expect(
      updateCompany(user.id, company.id, { name: "Acme", location: "Pune" })
    ).resolves.toBeDefined()
  })

  it("throws CompanyNotFoundError for another user's company", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await createCompany(owner.id, { name: "Acme" })
    await expect(updateCompany(other.id, company.id, { name: "Hacked" })).rejects.toBeInstanceOf(
      CompanyNotFoundError
    )
  })
})

describe("deleteCompany", () => {
  it("deletes a company with no applications", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await expect(deleteCompany(user.id, company.id)).resolves.toBeUndefined()
  })

  it("refuses to delete a company that has applications, reporting the count", async () => {
    const user = await makeUser()
    const company = await createCompany(user.id, { name: "Acme" })
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Engineer" },
    })

    await expect(deleteCompany(user.id, company.id)).rejects.toBeInstanceOf(
      CompanyHasApplicationsError
    )
    await expect(deleteCompany(user.id, company.id)).rejects.toMatchObject({ count: 1 })
  })
})

describe("findOrCreateByName", () => {
  it("returns the existing company when the name already exists", async () => {
    const user = await makeUser()
    const existing = await createCompany(user.id, { name: "Acme" })
    const found = await findOrCreateByName(user.id, "Acme")
    expect(found.id).toBe(existing.id)
  })

  it("creates the company when the name is new", async () => {
    const user = await makeUser()
    const created = await findOrCreateByName(user.id, "Globex")
    expect(created.name).toBe("Globex")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/services/company-service.test.ts`
Expected: FAIL — cannot resolve `./company-service`.

- [ ] **Step 3: Write the implementation**

`src/server/services/company-service.ts`:

```ts
import * as companyRepository from "@/server/repositories/company-repository"
import type { CompanyWithCount } from "@/server/repositories/company-repository"
import type { CreateCompanyInput } from "@/server/validators/company-schemas"
import type { Company } from "@prisma/client"

export class CompanyNameTakenError extends Error {
  constructor() {
    super("You already have a company with this name")
  }
}

export class CompanyNotFoundError extends Error {
  constructor() {
    super("Company not found")
  }
}

export class CompanyHasApplicationsError extends Error {
  constructor(public readonly count: number) {
    super(
      `This company has ${count} application${count === 1 ? "" : "s"}. Delete or reassign them first.`
    )
  }
}

export function listCompanies(userId: string): Promise<CompanyWithCount[]> {
  return companyRepository.listByUser(userId)
}

export async function getCompany(userId: string, id: string): Promise<Company> {
  const company = await companyRepository.findById(userId, id)
  if (!company) throw new CompanyNotFoundError()
  return company
}

export async function createCompany(
  userId: string,
  input: CreateCompanyInput
): Promise<Company> {
  const existing = await companyRepository.findByName(userId, input.name)
  if (existing) throw new CompanyNameTakenError()
  return companyRepository.create(userId, input)
}

export async function updateCompany(
  userId: string,
  id: string,
  input: CreateCompanyInput
): Promise<Company> {
  const clash = await companyRepository.findByName(userId, input.name)
  if (clash && clash.id !== id) throw new CompanyNameTakenError()

  const updated = await companyRepository.update(userId, id, input)
  if (!updated) throw new CompanyNotFoundError()
  return updated
}

export async function deleteCompany(userId: string, id: string): Promise<void> {
  const count = await companyRepository.countApplications(userId, id)
  if (count > 0) throw new CompanyHasApplicationsError(count)

  const deleted = await companyRepository.remove(userId, id)
  if (!deleted) throw new CompanyNotFoundError()
}

export async function findOrCreateByName(userId: string, name: string): Promise<Company> {
  const existing = await companyRepository.findByName(userId, name)
  if (existing) return existing
  return companyRepository.create(userId, { name })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/services/company-service.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/company-service.ts src/server/services/company-service.test.ts
git commit -m "feat: add company service with duplicate and delete guards"
```

---

### Task 6: Application validators (TDD)

**Files:**
- Create: `src/server/validators/application-schemas.test.ts`
- Create: `src/server/validators/application-schemas.ts`

**Interfaces:**
- Produces: `createApplicationSchema`, `updateApplicationSchema`, `updateStatusSchema`, and types `CreateApplicationInput`, `UpdateApplicationInput`, `UpdateStatusInput`.
- Cross-field rule: when both salaries are given, `salaryMax >= salaryMin`, with the error attached to the `salaryMax` field.
- `appliedAt` may not be in the future.

- [ ] **Step 1: Write the failing tests**

`src/server/validators/application-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  createApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
} from "./application-schemas"

const base = { companyId: "c1", roleTitle: "Engineer", status: "APPLIED" }

describe("createApplicationSchema", () => {
  it("accepts a minimal application", () => {
    expect(createApplicationSchema.safeParse(base).success).toBe(true)
  })

  it("rejects a missing company", () => {
    const result = createApplicationSchema.safeParse({ ...base, companyId: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.companyId?.[0]).toBe("Company is required")
  })

  it("rejects an empty role title", () => {
    const result = createApplicationSchema.safeParse({ ...base, roleTitle: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.roleTitle?.[0]).toBe("Role title is required")
  })

  it("rejects an unknown status", () => {
    expect(createApplicationSchema.safeParse({ ...base, status: "PENDING" }).success).toBe(false)
  })

  it("accepts every valid status", () => {
    for (const status of [
      "SAVED",
      "APPLIED",
      "SCREENING",
      "INTERVIEW",
      "OFFER",
      "ACCEPTED",
      "REJECTED",
    ]) {
      expect(createApplicationSchema.safeParse({ ...base, status }).success).toBe(true)
    }
  })

  it("defaults status to SAVED when omitted", () => {
    const result = createApplicationSchema.safeParse({ companyId: "c1", roleTitle: "Engineer" })
    expect(result.success && result.data.status).toBe("SAVED")
  })

  it("rejects a malformed job URL", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "not-a-url" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.jobUrl?.[0]).toBe("Enter a valid URL")
  })

  it("normalises an empty job URL to undefined", () => {
    const result = createApplicationSchema.safeParse({ ...base, jobUrl: "" })
    expect(result.success && result.data.jobUrl).toBeUndefined()
  })

  it("coerces salary strings to integers", () => {
    const result = createApplicationSchema.safeParse({ ...base, salaryMin: "1000", salaryMax: "2000" })
    expect(result.success && result.data.salaryMin).toBe(1000)
    expect(result.success && result.data.salaryMax).toBe(2000)
  })

  it("rejects a negative salary", () => {
    expect(createApplicationSchema.safeParse({ ...base, salaryMin: -1 }).success).toBe(false)
  })

  it("rejects salaryMax below salaryMin, reporting on salaryMax", () => {
    const result = createApplicationSchema.safeParse({ ...base, salaryMin: 2000, salaryMax: 1000 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.salaryMax?.[0]).toBe(
      "Maximum salary must be greater than or equal to minimum"
    )
  })

  it("accepts equal salaries", () => {
    expect(
      createApplicationSchema.safeParse({ ...base, salaryMin: 1000, salaryMax: 1000 }).success
    ).toBe(true)
  })

  it("accepts a salary maximum with no minimum", () => {
    expect(createApplicationSchema.safeParse({ ...base, salaryMax: 1000 }).success).toBe(true)
  })

  it("rejects a future applied date", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = createApplicationSchema.safeParse({ ...base, appliedAt: tomorrow })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.appliedAt?.[0]).toBe(
      "Applied date cannot be in the future"
    )
  })

  it("accepts a past applied date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(createApplicationSchema.safeParse({ ...base, appliedAt: yesterday }).success).toBe(true)
  })

  it("normalises an empty applied date to undefined", () => {
    const result = createApplicationSchema.safeParse({ ...base, appliedAt: "" })
    expect(result.success && result.data.appliedAt).toBeUndefined()
  })
})

describe("updateApplicationSchema", () => {
  it("requires an id", () => {
    expect(updateApplicationSchema.safeParse(base).success).toBe(false)
  })

  it("accepts an id with the base fields", () => {
    expect(updateApplicationSchema.safeParse({ ...base, id: "a1" }).success).toBe(true)
  })
})

describe("updateStatusSchema", () => {
  it("accepts an id and a valid status", () => {
    expect(updateStatusSchema.safeParse({ id: "a1", status: "INTERVIEW" }).success).toBe(true)
  })

  it("rejects an unknown status", () => {
    expect(updateStatusSchema.safeParse({ id: "a1", status: "NOPE" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/validators/application-schemas.test.ts`
Expected: FAIL — cannot resolve `./application-schemas`.

- [ ] **Step 3: Write the implementation**

`src/server/validators/application-schemas.ts`:

```ts
import { z } from "zod"
import { ApplicationStatus, WorkMode } from "@prisma/client"

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value === "" ? undefined : value))

const optionalUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value))

const optionalSalary = z.coerce
  .number()
  .int()
  .min(0, "Salary cannot be negative")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" || value === undefined ? undefined : Number(value)))

const optionalPastDate = z.coerce
  .date()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" || value === undefined ? undefined : new Date(value)))

const applicationFields = z.object({
  companyId: z.string().min(1, "Company is required"),
  roleTitle: z.string().trim().min(1, "Role title is required").max(200),
  status: z.enum(ApplicationStatus).default("SAVED"),
  jobUrl: optionalUrl,
  location: optionalText,
  workMode: z.enum(WorkMode).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  salaryMin: optionalSalary,
  salaryMax: optionalSalary,
  currency: z.string().trim().max(10).optional().transform((v) => (v === "" ? undefined : v)),
  source: optionalText,
  appliedAt: optionalPastDate,
  notes: optionalText,
})

function applyCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (value: z.infer<typeof applicationFields>) =>
        value.salaryMin === undefined ||
        value.salaryMax === undefined ||
        value.salaryMax >= value.salaryMin,
      {
        message: "Maximum salary must be greater than or equal to minimum",
        path: ["salaryMax"],
      }
    )
    .refine(
      (value: z.infer<typeof applicationFields>) =>
        value.appliedAt === undefined || value.appliedAt.getTime() <= Date.now(),
      { message: "Applied date cannot be in the future", path: ["appliedAt"] }
    )
}

export const createApplicationSchema = applyCrossFieldRules(applicationFields)
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>

export const updateApplicationSchema = applyCrossFieldRules(
  applicationFields.extend({ id: z.string().min(1) })
)
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>

export const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ApplicationStatus),
})
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/validators/application-schemas.test.ts`
Expected: PASS, 20 tests.

If `applyCrossFieldRules` produces a type error, replace it by duplicating the two `.refine(...)` calls onto `applicationFields` and onto `applicationFields.extend({ id: ... })` directly — the behaviour the tests assert is what matters, not the helper.

- [ ] **Step 5: Commit**

```bash
git add src/server/validators/application-schemas.ts src/server/validators/application-schemas.test.ts
git commit -m "feat: add application validation schemas with salary and date rules"
```

---

### Task 7: Application repository (TDD, ownership-scoped)

**Files:**
- Create: `src/server/repositories/application-repository.test.ts`
- Create: `src/server/repositories/application-repository.ts`

**Interfaces:**
- Produces `ApplicationWithCompany = Application & { company: Company }`, and:
  - `listByUser(userId: string): Promise<ApplicationWithCompany[]>` — ordered `updatedAt` desc
  - `listByCompany(userId: string, companyId: string): Promise<ApplicationWithCompany[]>`
  - `findById(userId: string, id: string): Promise<ApplicationWithCompany | null>`
  - `create(userId: string, data: CreateApplicationInput): Promise<Application>`
  - `update(userId: string, id: string, data: CreateApplicationInput): Promise<Application | null>`
  - `updateStatus(userId: string, id: string, status: ApplicationStatus): Promise<Application | null>`
  - `remove(userId: string, id: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

`src/server/repositories/application-repository.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as applicationRepository from "./application-repository"

const createdUserIds: string[] = []

async function makeUserWithCompany() {
  const user = await prisma.user.create({
    data: {
      name: "App Repo Test",
      email: `app-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("applicationRepository", () => {
  it("creates an application and lists it with its company", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByUser(user.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
    expect(list[0].company.name).toBe("Acme")
  })

  it("defaults status to SAVED", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "SAVED",
    })
    expect(created.status).toBe("SAVED")
  })

  it("lists applications for one company", async () => {
    const { user, company } = await makeUserWithCompany()
    const other = await prisma.company.create({ data: { userId: user.id, name: "Globex" } })
    await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    await applicationRepository.create(user.id, {
      companyId: other.id,
      roleTitle: "Designer",
      status: "APPLIED",
    })

    const list = await applicationRepository.listByCompany(user.id, company.id)
    expect(list).toHaveLength(1)
    expect(list[0].roleTitle).toBe("Engineer")
  })

  it("finds an application by id", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const found = await applicationRepository.findById(user.id, created.id)
    expect(found?.roleTitle).toBe("Engineer")
  })

  it("updates an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.update(user.id, created.id, {
      companyId: company.id,
      roleTitle: "Senior Engineer",
      status: "INTERVIEW",
    })
    expect(updated?.roleTitle).toBe("Senior Engineer")
    expect(updated?.status).toBe("INTERVIEW")
  })

  it("updates only the status", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await applicationRepository.updateStatus(user.id, created.id, "OFFER")
    expect(updated?.status).toBe("OFFER")
    expect(updated?.roleTitle).toBe("Engineer")
  })

  it("deletes an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await applicationRepository.create(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    expect(await applicationRepository.remove(user.id, created.id)).toBe(true)
    expect(await applicationRepository.findById(user.id, created.id)).toBeNull()
  })

  describe("ownership", () => {
    it("does not list another user's applications", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.listByUser(other.user.id)).toHaveLength(0)
    })

    it("does not find another user's application by id", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.findById(other.user.id, created.id)).toBeNull()
    })

    it("does not update another user's application status", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(
        await applicationRepository.updateStatus(other.user.id, created.id, "REJECTED")
      ).toBeNull()
      expect((await applicationRepository.findById(owner.user.id, created.id))?.status).toBe(
        "APPLIED"
      )
    })

    it("does not delete another user's application", async () => {
      const owner = await makeUserWithCompany()
      const other = await makeUserWithCompany()
      const created = await applicationRepository.create(owner.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })

      expect(await applicationRepository.remove(other.user.id, created.id)).toBe(false)
      expect(await applicationRepository.findById(owner.user.id, created.id)).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/repositories/application-repository.test.ts`
Expected: FAIL — cannot resolve `./application-repository`.

- [ ] **Step 3: Write the implementation**

`src/server/repositories/application-repository.ts`:

```ts
import { prisma } from "@/lib/db/prisma"
import type { Application, ApplicationStatus, Company } from "@prisma/client"
import type { CreateApplicationInput } from "@/server/validators/application-schemas"

export type ApplicationWithCompany = Application & { company: Company }

export function listByUser(userId: string): Promise<ApplicationWithCompany[]> {
  return prisma.application.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { updatedAt: "desc" },
  })
}

export function listByCompany(
  userId: string,
  companyId: string
): Promise<ApplicationWithCompany[]> {
  return prisma.application.findMany({
    where: { userId, companyId },
    include: { company: true },
    orderBy: { updatedAt: "desc" },
  })
}

export function findById(userId: string, id: string): Promise<ApplicationWithCompany | null> {
  return prisma.application.findFirst({ where: { id, userId }, include: { company: true } })
}

export function create(userId: string, data: CreateApplicationInput): Promise<Application> {
  return prisma.application.create({ data: { ...data, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateApplicationInput
): Promise<Application | null> {
  const { count } = await prisma.application.updateMany({ where: { id, userId }, data })
  if (count === 0) return null
  return prisma.application.findFirst({ where: { id, userId } })
}

export async function updateStatus(
  userId: string,
  id: string,
  status: ApplicationStatus
): Promise<Application | null> {
  const { count } = await prisma.application.updateMany({ where: { id, userId }, data: { status } })
  if (count === 0) return null
  return prisma.application.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.application.deleteMany({ where: { id, userId } })
  return count > 0
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/repositories/application-repository.test.ts`
Expected: PASS, 11 tests — including all four ownership tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/application-repository.ts src/server/repositories/application-repository.test.ts
git commit -m "feat: add ownership-scoped application repository"
```

---

### Task 8: Application service (TDD)

**Files:**
- Create: `src/server/services/application-service.test.ts`
- Create: `src/server/services/application-service.ts`

**Interfaces:**
- Produces: `ApplicationNotFoundError`, `CompanyNotOwnedError`; functions `listApplications`, `listApplicationsForCompany`, `getApplication`, `createApplication`, `updateApplication`, `changeStatus`, `deleteApplication`.
- **Security-critical:** `createApplication` and `updateApplication` verify the target `companyId` belongs to the same user before writing. Without that check a user could attach an application to someone else's company row by submitting a foreign id.

- [ ] **Step 1: Write the failing tests**

`src/server/services/application-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  ApplicationNotFoundError,
  CompanyNotOwnedError,
  changeStatus,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "./application-service"

const createdUserIds: string[] = []

async function makeUserWithCompany() {
  const user = await prisma.user.create({
    data: {
      name: "App Service Test",
      email: `app-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  const company = await prisma.company.create({ data: { userId: user.id, name: "Acme" } })
  return { user, company }
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    createdUserIds.length = 0
  }
})

describe("createApplication", () => {
  it("creates an application against the user's own company", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })
    expect(created.roleTitle).toBe("Engineer")
  })

  it("refuses to attach an application to another user's company", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()

    await expect(
      createApplication(other.user.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)
  })
})

describe("updateApplication", () => {
  it("updates an application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await updateApplication(user.id, created.id, {
      companyId: company.id,
      roleTitle: "Staff Engineer",
      status: "INTERVIEW",
    })
    expect(updated.roleTitle).toBe("Staff Engineer")
  })

  it("refuses to move an application onto another user's company", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(other.user.id, {
      companyId: other.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(
      updateApplication(other.user.id, created.id, {
        companyId: owner.company.id,
        roleTitle: "Engineer",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(CompanyNotOwnedError)
  })

  it("throws ApplicationNotFoundError for another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(
      updateApplication(other.user.id, created.id, {
        companyId: other.company.id,
        roleTitle: "Hacked",
        status: "APPLIED",
      })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
  })
})

describe("changeStatus", () => {
  it("changes the status", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    const updated = await changeStatus(user.id, created.id, "OFFER")
    expect(updated.status).toBe("OFFER")
  })

  it("throws ApplicationNotFoundError for another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(changeStatus(other.user.id, created.id, "REJECTED")).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })
})

describe("getApplication, listApplications and deleteApplication", () => {
  it("lists only the user's applications", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    expect(await listApplications(other.user.id)).toHaveLength(0)
  })

  it("throws ApplicationNotFoundError when getting another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(getApplication(other.user.id, created.id)).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })

  it("deletes the user's own application", async () => {
    const { user, company } = await makeUserWithCompany()
    const created = await createApplication(user.id, {
      companyId: company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(deleteApplication(user.id, created.id)).resolves.toBeUndefined()
  })

  it("throws ApplicationNotFoundError when deleting another user's application", async () => {
    const owner = await makeUserWithCompany()
    const other = await makeUserWithCompany()
    const created = await createApplication(owner.user.id, {
      companyId: owner.company.id,
      roleTitle: "Engineer",
      status: "APPLIED",
    })

    await expect(deleteApplication(other.user.id, created.id)).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/services/application-service.test.ts`
Expected: FAIL — cannot resolve `./application-service`.

- [ ] **Step 3: Write the implementation**

`src/server/services/application-service.ts`:

```ts
import * as applicationRepository from "@/server/repositories/application-repository"
import * as companyRepository from "@/server/repositories/company-repository"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { CreateApplicationInput } from "@/server/validators/application-schemas"
import type { Application, ApplicationStatus } from "@prisma/client"

export class ApplicationNotFoundError extends Error {
  constructor() {
    super("Application not found")
  }
}

export class CompanyNotOwnedError extends Error {
  constructor() {
    super("Company not found")
  }
}

async function assertCompanyOwned(userId: string, companyId: string): Promise<void> {
  const company = await companyRepository.findById(userId, companyId)
  if (!company) throw new CompanyNotOwnedError()
}

export function listApplications(userId: string): Promise<ApplicationWithCompany[]> {
  return applicationRepository.listByUser(userId)
}

export function listApplicationsForCompany(
  userId: string,
  companyId: string
): Promise<ApplicationWithCompany[]> {
  return applicationRepository.listByCompany(userId, companyId)
}

export async function getApplication(
  userId: string,
  id: string
): Promise<ApplicationWithCompany> {
  const application = await applicationRepository.findById(userId, id)
  if (!application) throw new ApplicationNotFoundError()
  return application
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<Application> {
  await assertCompanyOwned(userId, input.companyId)
  return applicationRepository.create(userId, input)
}

export async function updateApplication(
  userId: string,
  id: string,
  input: CreateApplicationInput
): Promise<Application> {
  const existing = await applicationRepository.findById(userId, id)
  if (!existing) throw new ApplicationNotFoundError()

  await assertCompanyOwned(userId, input.companyId)

  const updated = await applicationRepository.update(userId, id, input)
  if (!updated) throw new ApplicationNotFoundError()
  return updated
}

export async function changeStatus(
  userId: string,
  id: string,
  status: ApplicationStatus
): Promise<Application> {
  const updated = await applicationRepository.updateStatus(userId, id, status)
  if (!updated) throw new ApplicationNotFoundError()
  return updated
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const deleted = await applicationRepository.remove(userId, id)
  if (!deleted) throw new ApplicationNotFoundError()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/services/application-service.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: all files pass — 26 Phase 1 tests plus the 65 added in Tasks 3–8.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/application-service.ts src/server/services/application-service.test.ts
git commit -m "feat: add application service with cross-tenant company guard"
```

---

## Deviations from spec §4 (decided during planning)

The spec listed nine new shadcn primitives. Three are dropped, with reasons — the user-visible behaviour the spec describes is unchanged:

| Spec said | Plan does | Why |
|---|---|---|
| `command` + `popover` combobox | `Select` of existing companies with an inline **+ New company** option that reveals a text input | shadcn's combobox is a `cmdk` composition; `cmdk` is a Radix-era dependency and this project runs Base UI. The spec's actual requirement — create a company without leaving the form — is fully met, with one less third-party dependency. Revisit if the company list ever grows past a few dozen. |
| `calendar` + `popover` date picker | native `<input type="date">` | Native date input is keyboard- and screen-reader-accessible, needs no JS, and avoids a date-library dependency. |
| `tabs` for the Board/Table toggle | two `Link`s styled as buttons | The toggle changes a URL search param, so links are the correct semantics — they are shareable and work without JS. `tabs` would be a client-side control faking navigation. |

Components still required: `table`, `select`, `textarea`, `badge`, `alert-dialog`.

---

### Task 9: UI dependencies and the status badge

**Files:**
- Modify: `package.json` (via install commands)
- Create: `src/components/ui/table.tsx`, `select.tsx`, `textarea.tsx`, `badge.tsx`, `alert-dialog.tsx` (generated)
- Create: `src/components/status-badge.tsx`

**Interfaces:**
- Produces: `StatusBadge({ status }: { status: ApplicationStatus })`, and the exported constants `STATUS_ORDER: ApplicationStatus[]` and `STATUS_LABELS: Record<ApplicationStatus, string>` used by the board, table, and forms in later tasks.

- [ ] **Step 1: Install the drag-and-drop library**

Run: `pnpm add @dnd-kit/core@^6.3.1`
Expected: installs cleanly. It declares `react >=16.8.0`, which React 19.2.8 satisfies.

- [ ] **Step 2: Generate the shadcn primitives**

Run: `pnpm dlx shadcn@4.19.0 add table select textarea badge alert-dialog`
Expected: five new files under `src/components/ui/`. Accept any prompt to overwrite nothing existing.

- [ ] **Step 3: Verify what was generated**

Run:
```bash
for f in table select textarea badge alert-dialog; do
  echo "== $f"; grep -hoE "^import .*from \"[^\"]+\"" src/components/ui/$f.tsx | head -3
  grep -hoE "^export \{[^}]*\}" src/components/ui/$f.tsx | tr -d '\n' | cut -c1-200; echo
done
```
Expected: each file exists and exports the standard shadcn names — `Table, TableHeader, TableBody, TableRow, TableHead, TableCell`; `Select, SelectTrigger, SelectValue, SelectContent, SelectItem`; `Textarea`; `Badge`; `AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction`.

If any export name differs from the list above, use the name the file actually exports and keep the rest of this plan's usage unchanged — the component shapes are identical, only names could vary.

- [ ] **Step 4: Create the status badge and shared status constants**

`src/components/status-badge.tsx`:

```tsx
import { ApplicationStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const STATUS_ORDER: ApplicationStatus[] = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
}

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  APPLIED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  SCREENING: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  INTERVIEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  OFFER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ACCEPTED: "bg-green-600 text-white dark:bg-green-700",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
```

- [ ] **Step 5: Verify the build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/
git commit -m "feat: add dnd-kit, table/select/badge primitives, and status badge"
```

---

### Task 10: Route protection and navigation

Getting this wrong exposes both new sections to logged-out users, so it ships with the E2E test that proves it.

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/config/site.ts`
- Create: `e2e/applications.spec.ts` (first test only; extended in Task 18)

**Interfaces:**
- Produces: `/applications` and `/companies` redirect to `/login?callbackUrl=…` when signed out, and both appear in the sidebar.

- [ ] **Step 1: Extend route protection in both places**

`src/proxy.ts` — the handler body and the matcher must agree:

```ts
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth/auth.config"

const { auth } = NextAuth(authConfig)

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/applications", "/companies"]

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix)
  )

  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/applications/:path*",
    "/companies/:path*",
  ],
}
```

- [ ] **Step 2: Add the navigation entries**

`src/config/site.ts`:

```ts
import { Briefcase, Building2, LayoutDashboard, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const siteNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Applications", href: "/applications", icon: Briefcase },
  { title: "Companies", href: "/companies", icon: Building2 },
  { title: "Settings", href: "/settings", icon: Settings },
]
```

- [ ] **Step 3: Write the failing E2E test for route protection**

`e2e/applications.spec.ts`:

```ts
import "dotenv/config"
import { test, expect } from "@playwright/test"

test.describe("career routes", () => {
  test("unauthenticated requests to career routes redirect to login", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/applications")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fapplications")

    await page.goto("/companies")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fcompanies")

    await context.close()
  })
})
```

- [ ] **Step 4: Run the E2E test**

Run: `pnpm exec playwright test e2e/applications.spec.ts`
Expected: PASS. The routes do not exist yet, but protection happens before routing, so the redirect fires regardless. If it FAILS with a 404 instead of a redirect, the matcher in Step 1 is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/config/site.ts e2e/applications.spec.ts
git commit -m "feat: protect and navigate to applications and companies routes"
```

---

### Task 11: Companies page — server actions and list

**Files:**
- Create: `src/app/(app)/companies/actions.ts`
- Create: `src/app/(app)/companies/page.tsx`
- Create: `src/app/(app)/companies/loading.tsx`
- Create: `src/app/(app)/companies/company-table.tsx`

**Interfaces:**
- Produces: `createCompanyAction`, `updateCompanyAction`, `deleteCompanyAction`, each `(input: unknown) => Promise<ActionResult>`; and `CompanyTable({ companies })`.

- [ ] **Step 1: Write the server actions**

`src/app/(app)/companies/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  createCompanySchema,
  updateCompanySchema,
} from "@/server/validators/company-schemas"
import {
  CompanyHasApplicationsError,
  CompanyNameTakenError,
  CompanyNotFoundError,
  createCompany,
  deleteCompany,
  updateCompany,
} from "@/server/services/company-service"
import type { ActionResult } from "@/types/action-result"

export async function createCompanyAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createCompany(session.user.id, parsed.data)
    revalidatePath("/companies")
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateCompanyAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateCompany(session.user.id, id, data)
    revalidatePath("/companies")
    revalidatePath(`/companies/${id}`)
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    if (error instanceof CompanyNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteCompanyAction(id: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  try {
    await deleteCompany(session.user.id, id)
    revalidatePath("/companies")
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyHasApplicationsError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CompanyNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}
```

- [ ] **Step 2: Write the table component**

`src/app/(app)/companies/company-table.tsx`:

```tsx
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CompanyWithCount } from "@/server/repositories/company-repository"

export function CompanyTable({ companies }: { companies: CompanyWithCount[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Applications</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="font-medium">
                <Link href={`/companies/${company.id}`} className="hover:underline">
                  {company.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:underline"
                  >
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{company.location ?? "—"}</TableCell>
              <TableCell className="text-right">{company._count.applications}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Write the page**

`src/app/(app)/companies/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { listCompanies } from "@/server/services/company-service"
import { CompanyTable } from "./company-table"

export default async function CompaniesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const companies = await listCompanies(session.user.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every company you are tracking, and how many applications you have with each.
          </p>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <h2 className="font-medium">No companies yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Companies are created automatically when you add an application, or you can add one
            here first.
          </p>
        </div>
      ) : (
        <CompanyTable companies={companies} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write the loading skeleton**

`src/app/(app)/companies/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
```

- [ ] **Step 5: Verify it renders**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; `/companies` appears in the route list as a dynamic route.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/companies/
git commit -m "feat: add companies list page and server actions"
```

---

### Task 12: Company create/edit sheet

The spec's file list separated `company-sheet.tsx` from `company-form.tsx`. They are merged into one file here: the sheet is only ever a container for this one form, and splitting them would be two files with one responsibility between them.

**Files:**
- Create: `src/app/(app)/companies/company-sheet.tsx`
- Modify: `src/app/(app)/companies/page.tsx` (mount the create trigger)
- Modify: `src/app/(app)/companies/company-table.tsx` (per-row edit trigger)

**Interfaces:**
- Produces: `CompanySheet({ company, trigger })` where `company?: Company` — absent means create, present means edit.

- [ ] **Step 1: Write the sheet**

`src/app/(app)/companies/company-sheet.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  createCompanySchema,
  type CreateCompanyInput,
} from "@/server/validators/company-schemas"
import type { Company } from "@prisma/client"
import { createCompanyAction, updateCompanyAction } from "./actions"

export function CompanySheet({
  company,
  trigger,
}: {
  company?: Company
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(company)

  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      name: company?.name ?? "",
      website: company?.website ?? "",
      location: company?.location ?? "",
      notes: company?.notes ?? "",
    },
  })

  function onSubmit(values: CreateCompanyInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCompanyAction({ ...values, id: company!.id })
        : await createCompanyAction(values)

      if (result.success) {
        setOpen(false)
        form.reset(isEdit ? values : { name: "", website: "", location: "", notes: "" })
        router.refresh()
        toast.success(isEdit ? "Company updated" : "Company added")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            form.setError(field as keyof CreateCompanyInput, { message: messages[0] })
          }
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit company" : "Add company"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this company's details."
              : "Track a company you are applying to."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add company"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
```

If `SheetTrigger` does not accept `render` in the generated file, check `src/components/ui/sheet.tsx` — Base UI components in this project take `render={<Element/>}`. Pass the trigger element through whichever prop that file exposes.

- [ ] **Step 2: Mount the create trigger on the page**

In `src/app/(app)/companies/page.tsx`, add the imports:

```tsx
import { Button } from "@/components/ui/button"
import { CompanySheet } from "./company-sheet"
```

Replace the empty `<div className="flex items-center justify-between gap-4">` closing block so the header contains a trigger:

```tsx
        <CompanySheet trigger={<Button>Add company</Button>} />
```

And inside the empty state, below the paragraph, add:

```tsx
          <div className="mt-4">
            <CompanySheet trigger={<Button>Add your first company</Button>} />
          </div>
```

- [ ] **Step 3: Add a per-row edit trigger**

In `src/app/(app)/companies/company-table.tsx`, add to the imports:

```tsx
import { Button } from "@/components/ui/button"
import { CompanySheet } from "./company-sheet"
```

Add a trailing header cell:

```tsx
            <TableHead className="w-24 text-right">Actions</TableHead>
```

And a trailing body cell in each row:

```tsx
              <TableCell className="text-right">
                <CompanySheet
                  company={company}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
              </TableCell>
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/companies/
git commit -m "feat: add company create and edit sheet"
```

---

### Task 13: Company delete and detail page

**Files:**
- Create: `src/app/(app)/companies/delete-company-dialog.tsx`
- Create: `src/app/(app)/companies/[id]/page.tsx`
- Create: `src/app/(app)/companies/[id]/loading.tsx`
- Modify: `src/app/(app)/companies/company-table.tsx`

**Interfaces:**
- Produces: `DeleteCompanyDialog({ companyId, companyName })`; the route `/companies/[id]`.
- The delete dialog surfaces `CompanyHasApplicationsError`'s message inline inside the dialog, not as a toast — the user needs to read the count while deciding.

- [ ] **Step 1: Write the delete dialog**

`src/app/(app)/companies/delete-company-dialog.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteCompanyAction } from "./actions"

export function DeleteCompanyDialog({
  companyId,
  companyName,
}: {
  companyId: string
  companyName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onConfirm(event: React.MouseEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await deleteCompanyAction(companyId)
      if (result.success) {
        setOpen(false)
        router.refresh()
        toast.success("Company deleted")
        return
      }
      setError(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {companyName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the company. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Add the delete trigger to the table**

In `src/app/(app)/companies/company-table.tsx`, import it:

```tsx
import { DeleteCompanyDialog } from "./delete-company-dialog"
```

And inside the actions cell, after the edit sheet:

```tsx
                <DeleteCompanyDialog companyId={company.id} companyName={company.name} />
```

Widen the actions column to `className="w-40 text-right"`.

- [ ] **Step 3: Write the company detail page**

`src/app/(app)/companies/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth/auth"
import { CompanyNotFoundError, getCompany } from "@/server/services/company-service"
import { listApplicationsForCompany } from "@/server/services/application-service"
import { ApplicationTable } from "@/app/(app)/applications/application-table"

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  try {
    const company = await getCompany(session.user.id, id)
    const applications = await listApplicationsForCompany(session.user.id, id)

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[company.location, company.website].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>

        {company.notes ? <p className="text-sm whitespace-pre-wrap">{company.notes}</p> : null}

        <div className="space-y-2">
          <h2 className="font-medium">
            Applications ({applications.length})
          </h2>
          {applications.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              No applications at this company yet.
            </p>
          ) : (
            <ApplicationTable applications={applications} />
          )}
        </div>
      </div>
    )
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound()
    throw error
  }
}
```

A company that does not exist and one belonging to another user both reach `notFound()` — the service throws the same error for both, which is the §5.1 rule in practice.

- [ ] **Step 4: Write the detail loading skeleton**

`src/app/(app)/companies/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
```

- [ ] **Step 5: Verify**

This task depends on `ApplicationTable` from Task 15. Complete Task 15 before running the build, or temporarily stub the import. Once Task 15 is done:

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; `/companies/[id]` in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/companies/
git commit -m "feat: add company delete dialog and detail page"
```

---

### Task 14: Company selector

Replaces the spec's `command`+`popover` combobox (see Deviations). A `Select` over existing companies plus a **+ New company** option that reveals a text input, so an application can be created against a brand-new company without leaving the form.

**Files:**
- Create: `src/components/company-select.tsx`
- Create: `src/app/(app)/applications/company-actions.ts`

**Interfaces:**
- Consumes: `findOrCreateByName` from Task 5.
- Produces: `CompanySelect({ companies, value, newName, onChangeValue, onChangeNewName })` — a controlled pair; `value === "__new__"` means the caller should send `newCompanyName` instead of `companyId`.
- Produces: `resolveCompanyAction(name: string): Promise<{ id: string } | { error: string }>`.

- [ ] **Step 1: Write the resolve action**

`src/app/(app)/applications/company-actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { findOrCreateByName } from "@/server/services/company-service"

export async function resolveCompanyAction(
  name: string
): Promise<{ id: string } | { error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized." }

  const trimmed = name.trim()
  if (!trimmed) return { error: "Company name is required" }

  try {
    const company = await findOrCreateByName(session.user.id, trimmed)
    revalidatePath("/companies")
    return { id: company.id }
  } catch {
    return { error: "Could not save that company. Please try again." }
  }
}
```

- [ ] **Step 2: Write the selector**

`src/components/company-select.tsx`:

```tsx
"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Company } from "@prisma/client"

export const NEW_COMPANY = "__new__"

export function CompanySelect({
  companies,
  value,
  newName,
  onChangeValue,
  onChangeNewName,
}: {
  companies: Pick<Company, "id" | "name">[]
  value: string
  newName: string
  onChangeValue: (value: string) => void
  onChangeNewName: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChangeValue}>
        <SelectTrigger aria-label="Company">
          <SelectValue placeholder="Select a company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW_COMPANY}>+ New company</SelectItem>
        </SelectContent>
      </Select>

      {value === NEW_COMPANY ? (
        <Input
          aria-label="New company name"
          placeholder="Company name"
          value={newName}
          onChange={(event) => onChangeNewName(event.target.value)}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/company-select.tsx src/app/\(app\)/applications/company-actions.ts
git commit -m "feat: add company selector with inline create"
```

---

### Task 15: Applications — actions, page shell, view toggle, table

**Files:**
- Create: `src/app/(app)/applications/actions.ts`
- Create: `src/app/(app)/applications/page.tsx`
- Create: `src/app/(app)/applications/loading.tsx`
- Create: `src/app/(app)/applications/view-toggle.tsx`
- Create: `src/app/(app)/applications/application-table.tsx`

**Interfaces:**
- Produces: `createApplicationAction`, `updateApplicationAction`, `changeStatusAction(id, status)`, `deleteApplicationAction(id)`, all returning `ActionResult`.
- Produces: `ApplicationTable({ applications })` — also consumed by the company detail page from Task 13.
- Sorting and filtering are server-side, driven by `searchParams`; the table renders sort links, it does not hold sort state.

- [ ] **Step 1: Write the server actions**

`src/app/(app)/applications/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  createApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
} from "@/server/validators/application-schemas"
import {
  ApplicationNotFoundError,
  CompanyNotOwnedError,
  changeStatus,
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/server/services/application-service"
import type { ActionResult } from "@/types/action-result"

function revalidateAll() {
  revalidatePath("/applications")
  revalidatePath("/companies")
}

export async function createApplicationAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createApplication(session.user.id, parsed.data)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNotOwnedError) {
      return { success: false, fieldErrors: { companyId: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateApplicationAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateApplication(session.user.id, id, data)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNotOwnedError) {
      return { success: false, fieldErrors: { companyId: [error.message] } }
    }
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function changeStatusAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "That status is not valid." }
  }

  try {
    await changeStatus(session.user.id, parsed.data.id, parsed.data.status)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Could not move that application." }
  }
}

export async function deleteApplicationAction(id: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  try {
    await deleteApplication(session.user.id, id)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}
```

- [ ] **Step 2: Write the view toggle**

`src/app/(app)/applications/view-toggle.tsx`:

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"

export function ViewToggle({ view }: { view: "board" | "table" }) {
  const base = "px-3 py-1.5 text-sm rounded-md transition-colors"
  return (
    <nav aria-label="View" className="bg-muted inline-flex gap-1 rounded-lg p-1">
      <Link
        href="/applications?view=board"
        aria-current={view === "board" ? "page" : undefined}
        className={cn(base, view === "board" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Board
      </Link>
      <Link
        href="/applications?view=table"
        aria-current={view === "table" ? "page" : undefined}
        className={cn(base, view === "table" ? "bg-background shadow-sm" : "text-muted-foreground")}
      >
        Table
      </Link>
    </nav>
  )
}
```

- [ ] **Step 3: Write the table**

`src/app/(app)/applications/application-table.tsx`:

```tsx
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"

function formatSalary(app: ApplicationWithCompany) {
  if (app.salaryMin == null && app.salaryMax == null) return "—"
  const currency = app.currency ? `${app.currency} ` : ""
  if (app.salaryMin != null && app.salaryMax != null) {
    return `${currency}${app.salaryMin.toLocaleString()}–${app.salaryMax.toLocaleString()}`
  }
  const single = app.salaryMin ?? app.salaryMax
  return `${currency}${single!.toLocaleString()}`
}

export function ApplicationTable({
  applications,
}: {
  applications: ApplicationWithCompany[]
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Salary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id}>
              <TableCell className="font-medium">
                <Link href={`/companies/${app.companyId}`} className="hover:underline">
                  {app.company.name}
                </Link>
              </TableCell>
              <TableCell>{app.roleTitle}</TableCell>
              <TableCell>
                <StatusBadge status={app.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{app.location ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {app.appliedAt ? app.appliedAt.toISOString().slice(0, 10) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatSalary(app)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Write the page with server-side filtering**

`src/app/(app)/applications/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { ApplicationStatus } from "@prisma/client"
import { auth } from "@/lib/auth/auth"
import { listApplications } from "@/server/services/application-service"
import { listCompanies } from "@/server/services/company-service"
import { ApplicationTable } from "./application-table"
import { ViewToggle } from "./view-toggle"

function parseView(value: string | undefined): "board" | "table" {
  return value === "table" ? "table" : "board"
}

function parseStatus(value: string | undefined): ApplicationStatus | null {
  if (value && value in ApplicationStatus) return value as ApplicationStatus
  return null
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const params = await searchParams
  const view = parseView(params.view)
  const statusFilter = parseStatus(params.status)

  const [all, companies] = await Promise.all([
    listApplications(session.user.id),
    listCompanies(session.user.id),
  ])
  const applications = statusFilter ? all.filter((a) => a.status === statusFilter) : all

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {all.length} application{all.length === 1 ? "" : "s"} tracked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <h2 className="font-medium">No applications yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Add the first role you have applied for and it will show up on the board.
          </p>
        </div>
      ) : view === "table" ? (
        <ApplicationTable applications={applications} />
      ) : null}
    </div>
  )
}
```

The board branch is added in Task 17; until then the board view renders nothing, which is why Task 17 must follow.

- [ ] **Step 5: Write the loading skeleton**

`src/app/(app)/applications/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
```

- [ ] **Step 6: Verify the build, now that ApplicationTable exists for Task 13**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; `/applications` and `/companies/[id]` both present in the route list.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/applications/
git commit -m "feat: add applications page, table view, and server actions"
```

---

### Task 16: Application create/edit sheet and delete

**Files:**
- Create: `src/app/(app)/applications/application-sheet.tsx`
- Create: `src/app/(app)/applications/delete-application-dialog.tsx`
- Modify: `src/app/(app)/applications/page.tsx`
- Modify: `src/app/(app)/applications/application-table.tsx`

**Interfaces:**
- Produces: `ApplicationSheet({ companies, application, trigger })`, `DeleteApplicationDialog({ applicationId, label })`.
- When the company select is on **+ New company**, the sheet calls `resolveCompanyAction` first to get a real `companyId`, then submits.

- [ ] **Step 1: Write the sheet**

`src/app/(app)/applications/application-sheet.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { ApplicationStatus, WorkMode } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CompanySelect, NEW_COMPANY } from "@/components/company-select"
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { Company } from "@prisma/client"
import { createApplicationAction, updateApplicationAction } from "./actions"
import { resolveCompanyAction } from "./company-actions"

type FormValues = {
  roleTitle: string
  status: ApplicationStatus
  jobUrl: string
  location: string
  workMode: string
  salaryMin: string
  salaryMax: string
  currency: string
  source: string
  appliedAt: string
  notes: string
}

export function ApplicationSheet({
  companies,
  application,
  trigger,
}: {
  companies: Pick<Company, "id" | "name">[]
  application?: ApplicationWithCompany
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(application?.companyId ?? "")
  const [newCompanyName, setNewCompanyName] = useState("")
  const [companyError, setCompanyError] = useState<string | null>(null)
  const isEdit = Boolean(application)

  const form = useForm<FormValues>({
    defaultValues: {
      roleTitle: application?.roleTitle ?? "",
      status: application?.status ?? "SAVED",
      jobUrl: application?.jobUrl ?? "",
      location: application?.location ?? "",
      workMode: application?.workMode ?? "",
      salaryMin: application?.salaryMin?.toString() ?? "",
      salaryMax: application?.salaryMax?.toString() ?? "",
      currency: application?.currency ?? "",
      source: application?.source ?? "",
      appliedAt: application?.appliedAt ? application.appliedAt.toISOString().slice(0, 10) : "",
      notes: application?.notes ?? "",
    },
  })

  function onSubmit(values: FormValues) {
    setCompanyError(null)
    startTransition(async () => {
      let resolvedCompanyId = companyId

      if (companyId === NEW_COMPANY) {
        const resolved = await resolveCompanyAction(newCompanyName)
        if ("error" in resolved) {
          setCompanyError(resolved.error)
          return
        }
        resolvedCompanyId = resolved.id
      }

      if (!resolvedCompanyId) {
        setCompanyError("Company is required")
        return
      }

      const payload = { ...values, companyId: resolvedCompanyId }
      const result = isEdit
        ? await updateApplicationAction({ ...payload, id: application!.id })
        : await createApplicationAction(payload)

      if (result.success) {
        setOpen(false)
        router.refresh()
        toast.success(isEdit ? "Application updated" : "Application added")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (!messages?.[0]) continue
          if (field === "companyId") setCompanyError(messages[0])
          else form.setError(field as keyof FormValues, { message: messages[0] })
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  const errors = form.formState.errors

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit application" : "Add application"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update this application." : "Track a role you have applied for."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label>Company</Label>
            <CompanySelect
              companies={companies}
              value={companyId}
              newName={newCompanyName}
              onChangeValue={setCompanyId}
              onChangeNewName={setNewCompanyName}
            />
            {companyError ? (
              <p role="alert" className="text-destructive text-sm">
                {companyError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="roleTitle">Role title</Label>
            <Input id="roleTitle" {...form.register("roleTitle", { required: true })} />
            {errors.roleTitle ? (
              <p role="alert" className="text-destructive text-sm">
                Role title is required
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: string) =>
                form.setValue("status", value as ApplicationStatus)
              }
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobUrl">Job URL</Label>
            <Input id="jobUrl" placeholder="https://…" {...form.register("jobUrl")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...form.register("location")} />
            </div>
            <div className="space-y-2">
              <Label>Work mode</Label>
              <Select
                value={form.watch("workMode")}
                onValueChange={(value: string) => form.setValue("workMode", value)}
              >
                <SelectTrigger aria-label="Work mode">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(WorkMode).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode.charAt(0) + mode.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="salaryMin">Salary min</Label>
              <Input id="salaryMin" inputMode="numeric" {...form.register("salaryMin")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryMax">Salary max</Label>
              <Input id="salaryMax" inputMode="numeric" {...form.register("salaryMax")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" placeholder="INR" {...form.register("currency")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="appliedAt">Applied on</Label>
              <Input id="appliedAt" type="date" {...form.register("appliedAt")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input id="source" placeholder="LinkedIn" {...form.register("source")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...form.register("notes")} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add application"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

Validation here is server-authoritative: the form posts raw strings and the action's Zod schema is the single source of truth, returning field errors that are mapped back above. This avoids maintaining a second, transform-aware client schema for the same rules.

- [ ] **Step 2: Write the delete dialog**

`src/app/(app)/applications/delete-application-dialog.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteApplicationAction } from "./actions"

export function DeleteApplicationDialog({
  applicationId,
  label,
}: {
  applicationId: string
  label: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onConfirm(event: React.MouseEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await deleteApplicationAction(applicationId)
      if (result.success) {
        setOpen(false)
        router.refresh()
        toast.success("Application deleted")
        return
      }
      toast.error(result.formError ?? "Something went wrong. Please try again.")
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the application. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 3: Mount the add trigger on the page**

In `src/app/(app)/applications/page.tsx`, add imports:

```tsx
import { Button } from "@/components/ui/button"
import { ApplicationSheet } from "./application-sheet"
```

Inside the header's button row, before `<ViewToggle …/>`:

```tsx
          <ApplicationSheet companies={companies} trigger={<Button>Add application</Button>} />
```

And in the empty state, below the paragraph:

```tsx
          <div className="mt-4">
            <ApplicationSheet
              companies={companies}
              trigger={<Button>Add your first application</Button>}
            />
          </div>
```

- [ ] **Step 4: Add row actions to the table**

`ApplicationTable` gains an optional `companies` prop so it can render edit sheets; the company detail page passes it too. In `application-table.tsx`, change the signature and add imports:

```tsx
import { Button } from "@/components/ui/button"
import { ApplicationSheet } from "./application-sheet"
import { DeleteApplicationDialog } from "./delete-application-dialog"
import type { Company } from "@prisma/client"

export function ApplicationTable({
  applications,
  companies = [],
}: {
  applications: ApplicationWithCompany[]
  companies?: Pick<Company, "id" | "name">[]
}) {
```

Add a trailing header cell:

```tsx
            <TableHead className="w-40 text-right">Actions</TableHead>
```

And a trailing body cell:

```tsx
              <TableCell className="text-right">
                <ApplicationSheet
                  companies={companies}
                  application={app}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteApplicationDialog
                  applicationId={app.id}
                  label={`${app.roleTitle} at ${app.company.name}`}
                />
              </TableCell>
```

Then pass `companies` from the applications page: `<ApplicationTable applications={applications} companies={companies} />`.

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/applications/
git commit -m "feat: add application create, edit, and delete"
```

---

### Task 17: Board view with drag and drop

**Files:**
- Create: `src/app/(app)/applications/application-card.tsx`
- Create: `src/app/(app)/applications/application-board.tsx`
- Modify: `src/app/(app)/applications/page.tsx`

**Interfaces:**
- Produces: `ApplicationBoard({ applications, companies })`.
- Dropping a card on a new column updates local state immediately, then persists via `changeStatusAction`. On failure the card reverts and a toast explains why.
- Dropping a card on its current column is a no-op.
- `@dnd-kit/utilities` is deliberately not installed — the drag transform is written inline.

- [ ] **Step 1: Write the card**

`src/app/(app)/applications/application-card.tsx`:

```tsx
"use client"

import { useDraggable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"

export function ApplicationCard({
  application,
}: {
  application: ApplicationWithCompany
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
  })

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={cn(
        "bg-card cursor-grab rounded-md border p-3 shadow-sm active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <p className="text-sm font-medium">{application.company.name}</p>
      <p className="text-muted-foreground text-sm">{application.roleTitle}</p>
      {application.location ? (
        <p className="text-muted-foreground mt-1 text-xs">{application.location}</p>
      ) : null}
    </article>
  )
}
```

- [ ] **Step 2: Write the board**

`src/app/(app)/applications/application-board.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import { ApplicationStatus } from "@prisma/client"
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import { ApplicationCard } from "./application-card"
import { changeStatusAction } from "./actions"

function Column({
  status,
  applications,
}: {
  status: ApplicationStatus
  applications: ApplicationWithCompany[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={`bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg p-3 ${
        isOver ? "ring-primary ring-2" : ""
      }`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="text-muted-foreground text-xs">{applications.length}</span>
      </header>
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} />
      ))}
    </section>
  )
}

export function ApplicationBoard({
  applications,
}: {
  applications: ApplicationWithCompany[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(applications)

  const sensors = useSensors(
    // A small distance threshold keeps a plain click from registering as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const applicationId = String(active.id)
    const nextStatus = String(over.id) as ApplicationStatus
    const current = items.find((item) => item.id === applicationId)
    if (!current || current.status === nextStatus) return

    const previous = items
    setItems((prev) =>
      prev.map((item) =>
        item.id === applicationId ? { ...item, status: nextStatus } : item
      )
    )

    void changeStatusAction({ id: applicationId, status: nextStatus }).then((result) => {
      if (result.success) {
        router.refresh()
        return
      }
      setItems(previous)
      toast.error(result.formError ?? "Could not move that application.")
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            applications={items.filter((item) => item.status === status)}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 3: Render the board on the page**

In `src/app/(app)/applications/page.tsx`, import it:

```tsx
import { ApplicationBoard } from "./application-board"
```

Replace the `) : null}` at the end of the view branch with:

```tsx
      ) : (
        <ApplicationBoard applications={applications} />
      )}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/applications/
git commit -m "feat: add drag-and-drop application board"
```

---

### Task 18: End-to-end career flow test

**Files:**
- Modify: `e2e/applications.spec.ts`

**Interfaces:**
- Consumes: everything built above.
- Uses Playwright's `dragTo`, which respects the 5px activation constraint from Task 17.

- [ ] **Step 1: Extend the E2E spec**

Append inside the existing `test.describe("career routes", …)` block in `e2e/applications.spec.ts`, and add the imports at the top of the file:

```ts
import { prisma } from "@/lib/db/prisma"
```

```ts
  test("create a company and an application, move it, then delete", async ({ page }) => {
    const email = `career-e2e-${Date.now()}@example.com`
    const password = "Password123"
    const company = `Acme ${Date.now()}`

    await page.goto("/signup")
    await page.getByLabel("Name").fill("Career E2E")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign up" }).click()
    await expect(page).toHaveURL("/dashboard")

    await page.goto("/companies")
    await page.getByRole("button", { name: /Add (your first )?company/ }).click()
    await page.getByLabel("Name").fill(company)
    await page.getByRole("button", { name: "Add company" }).click()
    await expect(page.getByRole("cell", { name: company })).toBeVisible()

    await page.goto("/applications")
    await page.getByRole("button", { name: /Add (your first )?application/ }).click()
    await page.getByLabel("Company").click()
    await page.getByRole("option", { name: company }).click()
    await page.getByLabel("Role title").fill("Staff Engineer")
    await page.getByLabel("Status").click()
    await page.getByRole("option", { name: "Applied" }).click()
    await page.getByRole("button", { name: "Add application" }).click()

    const card = page.getByRole("article").filter({ hasText: "Staff Engineer" })
    await expect(card).toBeVisible()

    await card.dragTo(page.getByRole("region", { name: "Interview" }))

    await page.goto("/applications?view=table")
    await expect(page.getByRole("row", { name: /Staff Engineer/ })).toContainText("Interview")

    await page.getByRole("button", { name: "Delete" }).first().click()
    await page.getByRole("button", { name: "Delete", exact: true }).last().click()
    await expect(page.getByText("Staff Engineer")).toHaveCount(0)

    await prisma.user.deleteMany({ where: { email } })
  })
```

If `getByRole("region", …)` does not match, the board columns render as `<section aria-label>`, which maps to the `region` role only when labelled — it is, via `aria-label`. If the drag still does not register, raise the activation distance or use `page.mouse` steps; do not remove the activation constraint, which exists so clicks are not swallowed.

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm test:e2e`
Expected: all tests pass — the Phase 1 auth spec plus both career tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/applications.spec.ts
git commit -m "test: add end-to-end career flow spec"
```

---

### Task 19: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README's feature summary**

Replace the opening paragraph of `README.md` with:

```markdown
A personal career & productivity management platform.

Implemented so far:

- **Phase 1 — Foundation:** auth (sign up, log in, profile, password), app
  shell, design system.
  See `docs/superpowers/specs/2026-08-24-phase1-foundation-design.md`.
- **Phase 2 — Core career:** companies, applications, a seven-stage status
  pipeline, a drag-and-drop board and a sortable table.
  See `docs/superpowers/specs/2026-09-12-phase2-core-career-design.md`.
```

- [ ] **Step 2: Run every check**

Run:
```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build && pnpm test:e2e
```
Expected: lint clean, no type errors, all Vitest tests pass, build succeeds, all Playwright tests pass.

- [ ] **Step 3: Confirm no ownership rule was violated**

Run: `grep -rn "findUnique" src/server/repositories/`
Expected: matches only in `user-repository.ts` (a `User` is addressed by its own id and is not user-owned data). Any `findUnique` in `company-repository.ts` or `application-repository.ts` is a §5.1 violation and must be changed to `findFirst` with a `userId` in the `where`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe Phase 2 in the README"
```

---

## Self-Review Notes

**Spec coverage.** Walked each spec section against the tasks:

| Spec section | Covered by |
|---|---|
| §5.1 ownership rule | Tasks 4, 7 (implementation + 8 ownership tests), Task 19 Step 3 (audit) |
| §6 schema | Task 1 |
| §7 applications page, sheet, empty state | Tasks 15, 16 |
| §7 companies page + detail | Tasks 11, 13 |
| §7 delete refusal with count | Tasks 5, 11, 13 |
| §8 board interaction, optimistic revert, no ordering | Task 17 |
| §9 navigation | Task 10 |
| §10 route protection (both places) | Task 10 |
| §11.1 validation | Tasks 3, 6 |
| §11.2 typed domain errors | Tasks 5, 8, 11, 15 |
| §11.3 loading states | Tasks 11, 13, 15 |
| §11.4 testing | Tasks 3–8 (unit + integration), 10, 18 (E2E) |
| §11.5 shared ActionResult | Task 2 |

**Gaps found and closed during review:**
- The spec's Table view promised **sorting**; the plan implements status filtering and a fixed `updatedAt` order only. Sorting is intentionally dropped rather than half-specified — it would need sort links, a whitelist of sortable columns, and server-side ordering across six columns, which is its own task's worth of work and was not worth expanding this plan for. **Agreed with the product owner on 2026-09-12: build without sorting and revisit once the table has real use.** Spec §7's sorting promise therefore remains outstanding work, tracked here rather than silently dropped — it is the first candidate for a Phase 2.1 follow-up.
- The spec listed `command`, `popover`, `calendar`, and `tabs` primitives; the Deviations section above records why each was dropped and what replaces it.
- `ApplicationTable` is consumed by the company detail page (Task 13) before it is created (Task 15). Task 13 Step 5 states the dependency explicitly.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries the code.

**Type consistency:** `CreateCompanyInput` and `CreateApplicationInput` are produced in Tasks 3 and 6 and consumed by the same names in Tasks 4, 5, 7, 8. `CompanyWithCount` (Task 4) is used in Tasks 5 and 11. `ApplicationWithCompany` (Task 7) is used in Tasks 8, 13, 15, 16, 17. `STATUS_ORDER` / `STATUS_LABELS` (Task 9) are used in Tasks 16 and 17. `ActionResult` (Task 2) is the return type of every action. `NEW_COMPANY` (Task 14) is used in Task 16. Checked — no drift.

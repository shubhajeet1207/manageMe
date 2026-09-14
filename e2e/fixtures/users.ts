import "dotenv/config"
import { randomBytes } from "node:crypto"
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"

/**
 * Test users for specs that run against the SHARED remote database.
 *
 * Two rules hold every spec in this directory together: nothing reads a row it
 * did not create (so no assertion may ever depend on a global count), and every
 * row a spec creates hangs off a user the spec deletes afterwards. `User` is the
 * cascade root for every model in the schema, so deleting one address takes its
 * documents, tasks, projects, links, inbox and credentials with it.
 */

/**
 * 12 characters minimum — `newPasswordRules` in auth-schemas.ts rejects
 * anything shorter and also rejects a single repeated character, so the
 * 11-character "Password123" that predates that rule no longer signs anyone up.
 */
export const TEST_PASSWORD = "e2e-Passphrase-2026"

export type TestUser = {
  email: string
  name: string
  page: Page
  context: BrowserContext
}

/** Unique across parallel runs and across re-runs in the same millisecond:
 *  `Date.now()` alone collides when two specs start together, and these rows
 *  live in a database other work is using at the same time. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}@example.com`
}

/**
 * `signupAction` meters five attempts per client IP and refills one every five
 * minutes (src/lib/rate-limit.ts), and `clientIpFromHeaders` takes the leftmost
 * `X-Forwarded-For` entry. A spec file that created a sixth user would be told
 * "Too many signup attempts" and fail for a reason with nothing to do with what
 * it tests — and the bucket outlives the run, so the next one would start
 * throttled. Every test user therefore arrives from its own address.
 */
function isolatedClientIp(): string {
  const octets = randomBytes(3)
  return `198.18.${octets[0]}.${octets[1]}`
}

/**
 * A brand-new browser context per user, which is what makes the cross-tenant
 * tests possible at all: two users signed in at once, each with their own
 * cookie jar, and `page.request` inheriting that jar for direct Server Action
 * calls.
 */
export async function signUpUser(browser: Browser, prefix: string): Promise<TestUser> {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": isolatedClientIp() },
  })
  const page = await context.newPage()
  const email = uniqueEmail(prefix)
  const name = `E2E ${prefix}`

  await page.goto("/signup")
  await page.getByLabel("Name").fill(name)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(TEST_PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expect(page).toHaveURL("/dashboard")

  return { email, name, page, context }
}

/**
 * Closes the contexts and deletes the users. Safe to call with users whose
 * signup failed half way, so it can sit in an unconditional `afterEach`.
 */
export async function disposeUsers(users: TestUser[]): Promise<void> {
  for (const user of users) {
    await user.context.close().catch(() => {})
  }
  const emails = users.map((user) => user.email)
  if (emails.length > 0) await prisma.user.deleteMany({ where: { email: { in: emails } } })
}

/** The row id behind a signed-up address, for the ownership assertions that
 *  have to check the database rather than the screen. */
export async function userIdFor(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new Error(`No user row for ${email}`)
  return user.id
}

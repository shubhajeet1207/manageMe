import "dotenv/config"
import { test, expect } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"

test.describe("auth", () => {
  let email: string

  test.afterEach(async () => {
    if (email) await prisma.user.deleteMany({ where: { email } })
  })

  test("unauthenticated request to a protected route redirects to login", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/dashboard")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fdashboard")
    await context.close()
  })

  test("signup, dashboard, logout, login, logout", async ({ page }) => {
    email = `e2e-${Date.now()}@example.com`
    const password = "Password123"
    const name = "E2E Test User"

    await page.goto("/signup")
    await page.getByLabel("Name").fill(name)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign up" }).click()

    await expect(page).toHaveURL("/dashboard")
    await expect(page.getByRole("heading", { name: `Welcome, ${name}` })).toBeVisible()

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
})

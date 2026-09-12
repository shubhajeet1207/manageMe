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

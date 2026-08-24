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

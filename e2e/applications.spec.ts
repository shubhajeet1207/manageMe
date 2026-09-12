import "dotenv/config"
import { test, expect } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"

test.describe("career routes", () => {
  // The board lays out all 7 status columns side by side (7 * 304px), wider than
  // Playwright's default 1280px viewport. With a narrower viewport the drag target
  // sits outside the visible area, and dnd-kit's auto-scroll shifts the columns
  // mid-drag, landing the card one column over from wherever the pointer aimed.
  test.use({ viewport: { width: 2400, height: 900 } })

  test("unauthenticated requests to career routes redirect to login", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/applications")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fapplications")

    await page.goto("/companies")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fcompanies")

    await context.close()
  })

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
    // The header's "Add company" trigger and the empty-state's "Add your first
    // company" trigger both render at once on a fresh account; either opens the
    // same create sheet.
    await page.getByRole("button", { name: /Add (your first )?company/ }).first().click()
    await page.getByLabel("Name").fill(company)
    await page.getByRole("button", { name: "Add company" }).click()
    await expect(page.getByRole("cell", { name: company })).toBeVisible()

    await page.goto("/applications")
    // Same dual-trigger situation as the companies page.
    await page.getByRole("button", { name: /Add (your first )?application/ }).first().click()
    await page.getByLabel("Company").click()
    await page.getByRole("option", { name: company }).click()
    await page.getByLabel("Role title").fill("Staff Engineer")
    await page.getByLabel("Status").click()
    await page.getByRole("option", { name: "Applied" }).click()
    await page.getByRole("button", { name: "Add application" }).click()

    // dnd-kit's useDraggable stamps role="button" onto the <article>, so an
    // ARIA-role query would miss it; select the <article> tag directly.
    const card = page.locator("article").filter({ hasText: "Staff Engineer" })
    await expect(card).toBeVisible()

    const interviewColumn = page.getByRole("region", { name: "Interview" })
    const cardBox = await card.boundingBox()
    const columnBox = await interviewColumn.boundingBox()
    if (!cardBox || !columnBox) throw new Error("Could not measure drag source/target")

    const startX = cardBox.x + cardBox.width / 2
    const startY = cardBox.y + cardBox.height / 2
    const endX = columnBox.x + columnBox.width / 2
    const endY = columnBox.y + columnBox.height / 2

    // dragTo() jumps straight from source to target in one move, but the board's
    // PointerSensor needs several incremental pointermove events past its 5px
    // activation distance before dnd-kit will recognize a drag at all — a single
    // jump never crosses that threshold as a "drag". Drive the pointer by hand.
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        startX + ((endX - startX) * i) / steps,
        startY + ((endY - startY) * i) / steps
      )
    }
    // onDragEnd updates the board optimistically and fires the status mutation
    // without awaiting it, so the request is still in flight when mouse.up()
    // returns. waitForLoadState("networkidle") is a no-op here — the page's
    // initial load already went idle, so it resolves immediately rather than
    // watching for this later request. Arm the response listener first so the
    // subsequent navigation can't race — or cancel — the in-flight write.
    const statusPersisted = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/applications")
    )
    await page.mouse.up()

    await expect(interviewColumn.locator("article").filter({ hasText: "Staff Engineer" })).toBeVisible()
    await statusPersisted

    await page.goto("/applications?view=table")
    await expect(page.getByRole("row", { name: /Staff Engineer/ })).toContainText("Interview")

    await page.getByRole("button", { name: "Delete" }).first().click()
    await page.getByRole("button", { name: "Delete", exact: true }).last().click()
    await expect(page.getByText("Staff Engineer")).toHaveCount(0)

    await prisma.user.deleteMany({ where: { email } })
  })
})

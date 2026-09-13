import "dotenv/config"
import path from "node:path"
import { test, expect, type Locator, type Page } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"

const FIXTURES = path.join(__dirname, "fixtures")
const PDF_V1 = path.join(FIXTURES, "resume-v1.pdf")
const PDF_V2 = path.join(FIXTURES, "resume-v2.pdf")
// HTML bytes behind a .pdf extension. The browser types it from the extension,
// so `file.type` is "application/pdf" and every check short of reading the
// bytes waves it through.
const HTML_NAMED_PDF = path.join(FIXTURES, "not-a-resume.pdf")

async function signUp(page: Page, email: string) {
  await page.goto("/signup")
  await page.getByLabel("Name").fill("Resume E2E")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("Password123")
  await page.getByRole("button", { name: "Sign up" }).click()
  await expect(page).toHaveURL("/dashboard")
}

/**
 * Create a resume slot from /resumes and open its detail page, returning that
 * URL so later assertions can navigate to it afresh.
 */
async function createResume(page: Page, name: string): Promise<string> {
  await page.goto("/resumes")
  // On a fresh account the header trigger and the empty-state trigger both
  // render; either opens the same sheet. The submit button inside it carries
  // the same name, hence the scoping to the open dialog below.
  await page.getByRole("button", { name: /^Add (your first )?resume$/ }).first().click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("Name").fill(name)
  await sheet.getByRole("button", { name: "Add resume" }).click()
  await expect(sheet).toHaveCount(0)

  await page.getByRole("link", { name }).click()
  await expect(page).toHaveURL(/\/resumes\/[^/]+$/)
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible()
  return page.url()
}

async function openUploadSheet(page: Page, file: string, label: string): Promise<Locator> {
  await page
    .getByRole("button", { name: /^Upload (new version|the first version)$/ })
    .first()
    .click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("File").setInputFiles(file)
  // The sheet derives a label from the filename; overwrite it so the test owns
  // the string it later asserts on.
  await sheet.getByLabel("Label").fill(label)
  return sheet
}

async function uploadVersion(page: Page, file: string, label: string) {
  const sheet = await openUploadSheet(page, file, label)
  await sheet.getByRole("button", { name: "Upload version" }).click()
  // The sheet only closes when the action reported success.
  await expect(sheet).toHaveCount(0)
}

/**
 * The version table on the resume detail page, identified by its own column
 * header rather than a class: the page carries a second table ("Used by") and
 * the styling was just reworked.
 */
function versionRows(page: Page): Locator {
  return page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: "Label" }) })
    .locator("tbody tr")
}

async function addApplication(
  page: Page,
  options: { company: string; newCompany?: boolean; roleTitle: string; versionLabel: string }
) {
  await page.getByRole("button", { name: /^Add (your first )?application$/ }).first().click()
  const sheet = page.getByRole("dialog")

  await sheet.getByLabel("Company").click()
  if (options.newCompany) {
    // Select options are portaled to the body, outside the sheet.
    await page.getByRole("option", { name: "+ New company" }).click()
    await sheet.getByLabel("New company name").fill(options.company)
  } else {
    await page.getByRole("option", { name: options.company }).click()
  }

  await sheet.getByLabel("Role title").fill(options.roleTitle)
  await sheet.getByLabel("Status").click()
  await page.getByRole("option", { name: "Applied" }).click()

  await sheet.getByLabel("Resume").click()
  // Options read "<label> · <date>", so anchor on the label rather than
  // matching the date this test did not choose.
  await page.getByRole("option", { name: new RegExp(`^${options.versionLabel} ·`) }).click()

  await sheet.getByRole("button", { name: "Add application" }).click()
  await expect(sheet).toHaveCount(0)
}

test.describe("resumes", () => {
  let email: string

  test.afterEach(async () => {
    // Deleting the user cascades through Resume, ResumeVersion, Application and
    // Company. Application.resumeVersionId is ON DELETE RESTRICT, but the
    // Application rows are cascaded away before the ResumeVersion rows they
    // point at, so the restrict never fires on this path.
    if (email) await prisma.user.deleteMany({ where: { email } })
  })

  test("unauthenticated request to /resumes redirects to login", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/resumes")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fresumes")
    await context.close()
  })

  test("an uploaded PDF becomes the current version, and a second upload stacks on top", async ({
    page,
  }) => {
    email = `resume-e2e-${Date.now()}@example.com`
    const resumeName = `Backend SWE ${Date.now()}`

    await signUp(page, email)
    const detailUrl = await createResume(page, resumeName)

    await expect(page.getByText("No versions uploaded yet.")).toBeVisible()
    await expect(versionRows(page)).toHaveCount(0)

    await uploadVersion(page, PDF_V1, "Original")

    // Navigate afresh so the assertions below re-run the Server Component
    // against the database. Asserting the DOM the upload left behind would pass
    // even if nothing had been written.
    await page.goto(detailUrl)
    await expect(page.getByText(/^Current version: Original · uploaded /)).toBeVisible()
    await expect(page.getByRole("heading", { name: "Versions (1)" })).toBeVisible()

    const afterFirst = versionRows(page)
    await expect(afterFirst).toHaveCount(1)
    await expect(afterFirst.nth(0)).toContainText("Original")
    await expect(afterFirst.nth(0)).toContainText("resume-v1.pdf")
    // The current version is the one row with no "set as current" affordance.
    await expect(afterFirst.nth(0).getByText("Current", { exact: true })).toBeVisible()
    await expect(afterFirst.nth(0).getByRole("button", { name: /as current$/ })).toHaveCount(0)

    // The bytes themselves survived the round trip through storage and back out
    // of the authorising route — not just the row.
    const fileHref = await afterFirst
      .nth(0)
      .getByRole("link", { name: "Open Original" })
      .getAttribute("href")
    expect(fileHref).toMatch(/^\/api\/resume-versions\/[^/]+\/file$/)
    const fileResponse = await page.request.get(fileHref!)
    expect(fileResponse.status()).toBe(200)
    expect(fileResponse.headers()["content-type"]).toBe("application/pdf")
    expect((await fileResponse.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-")

    await uploadVersion(page, PDF_V2, "March rewrite")

    await page.goto(detailUrl)
    await expect(page.getByRole("heading", { name: "Versions (2)" })).toBeVisible()
    await expect(page.getByText(/^Current version: March rewrite · uploaded /)).toBeVisible()

    const rows = versionRows(page)
    await expect(rows).toHaveCount(2)
    // Newest first.
    await expect(rows.nth(0)).toContainText("March rewrite")
    await expect(rows.nth(0)).toContainText("resume-v2.pdf")
    await expect(rows.nth(1)).toContainText("Original")
    await expect(rows.nth(1)).toContainText("resume-v1.pdf")
    // …and the newest is the one marked current.
    await expect(rows.nth(0).getByText("Current", { exact: true })).toBeVisible()
    await expect(rows.nth(0).getByRole("button", { name: /as current$/ })).toHaveCount(0)
    await expect(rows.nth(1).getByText("Current", { exact: true })).toHaveCount(0)
    await expect(rows.nth(1).getByRole("button", { name: "Set Original as current" })).toBeVisible()

    // The library page reads the same rows through a different query.
    await page.goto("/resumes")
    const libraryRow = page.getByRole("row", { name: new RegExp(resumeName) })
    await expect(libraryRow).toContainText("March rewrite")
    await expect(libraryRow.getByRole("cell", { name: "2", exact: true }).first()).toBeVisible()
  })

  test("an HTML file renamed .pdf is rejected by the server and writes no version", async ({
    page,
  }) => {
    email = `resume-magic-e2e-${Date.now()}@example.com`
    const resumeName = `Polyglot probe ${Date.now()}`

    await signUp(page, email)
    const detailUrl = await createResume(page, resumeName)
    await uploadVersion(page, PDF_V1, "Original")

    await page.goto(detailUrl)
    await expect(versionRows(page)).toHaveCount(1)
    const resumeId = detailUrl.split("/").pop()!
    const versionsBefore = await prisma.resumeVersion.count({ where: { resumeId } })
    expect(versionsBefore).toBe(1)

    const sheet = await openUploadSheet(page, HTML_NAMED_PDF, "Definitely a PDF")

    // The point of this test is the Server Action boundary, so wait for the
    // POST rather than trusting that the click produced one: a client-side
    // rejection would never issue it, and the assertion below would then be
    // proving nothing about magic-byte validation.
    const actionPosted = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes(resumeId)
    )
    await sheet.getByRole("button", { name: "Upload version" }).click()
    expect((await actionPosted).status()).toBe(200)

    // The server's wording, not the client's. The form's own type check says
    // "Only PDF files are supported"; this string can only come from
    // InvalidPdfError, i.e. from the magic-byte check reading the bytes.
    await expect(sheet.getByRole("alert")).toHaveText("That file isn't a PDF.")
    await expect(sheet).toBeVisible()

    // The refusal has to be a refusal in the database, not just on screen.
    expect(await prisma.resumeVersion.count({ where: { resumeId } })).toBe(1)

    await page.reload()
    await expect(page.getByRole("heading", { name: "Versions (1)" })).toBeVisible()
    const rows = versionRows(page)
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText("Original")
    await expect(page.getByText("Definitely a PDF")).toHaveCount(0)
    await expect(page.getByText("not-a-resume.pdf")).toHaveCount(0)
    // The rejected upload must not have displaced the version that is current.
    await expect(page.getByText(/^Current version: Original · uploaded /)).toBeVisible()

    // The control. Same sheet, same label, same .pdf extension, same declared
    // content type — only the bytes differ, and this one is accepted. Without
    // it the test above could be passing for some unrelated reason (a rejected
    // label, a broken form) rather than because of the magic-byte check.
    await uploadVersion(page, PDF_V1, "Definitely a PDF")
    await page.goto(detailUrl)
    await expect(page.getByRole("heading", { name: "Versions (2)" })).toBeVisible()
    await expect(versionRows(page).nth(0)).toContainText("Definitely a PDF")
    expect(await prisma.resumeVersion.count({ where: { resumeId } })).toBe(2)
  })

  test("a linked version shows on the application, and deleting the resume is refused", async ({
    page,
  }) => {
    // The applications table only shows its Resume column from xl up; pin a
    // desktop viewport rather than depending on the 1280px default sitting
    // exactly on that breakpoint.
    await page.setViewportSize({ width: 1440, height: 900 })

    email = `resume-link-e2e-${Date.now()}@example.com`
    const resumeName = `Data roles ${Date.now()}`
    const company = `Acme ${Date.now()}`

    await signUp(page, email)
    const detailUrl = await createResume(page, resumeName)
    await uploadVersion(page, PDF_V1, "Original")
    await uploadVersion(page, PDF_V2, "March rewrite")

    await page.goto("/applications")
    await addApplication(page, {
      company,
      newCompany: true,
      roleTitle: "Staff Data Engineer",
      versionLabel: "Original",
    })
    // Reload rather than trusting the sheet's router.refresh() to have landed:
    // the company just created has to be in the server-rendered option list
    // before the second application can pick it.
    await page.goto("/applications")
    // Two applications on two different versions of the same slot: the refusal
    // below has to count across versions, not per version.
    await addApplication(page, {
      company,
      roleTitle: "Principal Data Engineer",
      versionLabel: "March rewrite",
    })

    // Fresh navigation: this re-runs the applications Server Component against
    // the database rather than reading the optimistic client state.
    await page.goto("/applications?view=table")
    await expect(
      page.getByRole("row", { name: /Staff Data Engineer/ })
    ).toContainText(`${resumeName} · Original`)
    await expect(
      page.getByRole("row", { name: /Principal Data Engineer/ })
    ).toContainText(`${resumeName} · March rewrite`)

    // The resume's own "Used by" view agrees about which file went where.
    await page.goto(detailUrl)
    const usage = page
      .locator("table")
      .filter({ has: page.getByRole("columnheader", { name: "Version sent" }) })
      .locator("tbody tr")
    await expect(usage).toHaveCount(2)
    await expect(usage.filter({ hasText: "Staff Data Engineer" })).toContainText("Original")
    await expect(usage.filter({ hasText: "Principal Data Engineer" })).toContainText(
      "March rewrite"
    )

    // Deleting a resume two applications were sent is refused, and the message
    // names the count.
    await page.goto("/resumes")
    await page
      .getByRole("row", { name: new RegExp(resumeName) })
      .getByRole("button", { name: "Delete" })
      .click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm.getByRole("heading", { name: `Delete ${resumeName}?` })).toBeVisible()
    await confirm.getByRole("button", { name: "Delete" }).click()
    await expect(confirm.getByRole("alert")).toHaveText(
      "2 applications were sent a version of this resume. Unlink them first."
    )

    // Refused means still there — checked against the database, not the dialog.
    const resumeId = detailUrl.split("/").pop()!
    expect(await prisma.resume.count({ where: { id: resumeId } })).toBe(1)
    expect(await prisma.resumeVersion.count({ where: { resumeId } })).toBe(2)

    await confirm.getByRole("button", { name: "Cancel" }).click()
    await page.goto("/resumes")
    await expect(page.getByRole("link", { name: resumeName })).toBeVisible()
  })
})

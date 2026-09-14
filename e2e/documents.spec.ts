import "dotenv/config"
import { createHash } from "node:crypto"
import path from "node:path"
import { test, expect, type Locator, type Page } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"
import { disposeUsers, signUpUser, uniqueSuffix, userIdFor, type TestUser } from "./fixtures/users"
import {
  actionResponseText,
  callServerAction,
  captureServerAction,
  recordServerActionRequests,
  replayUploadAction,
} from "./fixtures/server-actions"

const FIXTURES = path.join(__dirname, "fixtures")
const OFFER_PDF = path.join(FIXTURES, "offer-letter.pdf")
const CERTIFICATE_PNG = path.join(FIXTURES, "certificate.png")
// HTML bytes behind a .png name. The browser types a file from its extension,
// so `file.type` is "image/png" and every check short of reading the bytes —
// the `accept` attribute, the sheet's own type check, the Zod refinement —
// waves it through.
const HTML_NAMED_PNG = path.join(FIXTURES, "not-an-image.png")
const SVG = path.join(FIXTURES, "diagram.svg")

/** src/server/files/content-types.ts. The cap the vault enforces, restated here
 *  so a test that changes meaning when it moves fails rather than adapts. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** The header every generated PDF in this file starts with. Matching the
 *  registry's `%PDF-` signature at offset 0 is what leaves size as the only
 *  thing the server can be refusing. */
const PDF_HEADER = "%PDF-1.4\n"

/** The same bytes `replayUploadAction` builds in the page, so a digest computed
 *  here can be compared with what the server stored and served back. */
function pdfOfSize(bytes: number): Buffer {
  const header = Buffer.from(PDF_HEADER)
  return Buffer.concat([header, Buffer.alloc(bytes - header.length, 0x20)])
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function openUploadSheet(page: Page): Promise<Locator> {
  // On an empty vault the header trigger and the empty-state trigger both
  // render; either opens the same sheet.
  await page
    .getByRole("button", { name: /^Upload (document|your first document)$/ })
    .first()
    .click()
  return page.getByRole("dialog")
}

async function fillUpload(
  sheet: Locator,
  options: { file: string; title: string; tags?: string[] }
): Promise<void> {
  await sheet.getByLabel("File").setInputFiles(options.file)
  // The sheet derives a title from the filename; overwrite it so the test owns
  // the string it later asserts on.
  await sheet.getByLabel("Title").fill(options.title)
  for (const tag of options.tags ?? []) {
    await sheet.getByLabel("Tags").fill(tag)
    await sheet.getByLabel("Tags").press("Enter")
  }
}

/** Uploads through the real form and waits for the sheet to close, which it
 *  only does when the action reported success. */
async function uploadDocument(
  page: Page,
  options: { file: string; title: string; tags?: string[] }
): Promise<void> {
  const sheet = await openUploadSheet(page)
  await fillUpload(sheet, options)
  await sheet.getByRole("button", { name: "Upload document" }).click()
  await expect(sheet).toHaveCount(0)
}

function documentRows(page: Page): Locator {
  return page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: "Title" }) })
    .locator("tbody tr")
}

/** The vault's rows are reachable only through their own detail link, so the id
 *  comes from the href rather than from a lucky database query. */
async function documentIdByTitle(page: Page, title: string): Promise<string> {
  const href = await page.getByRole("link", { name: title, exact: true }).first().getAttribute("href")
  expect(href).toMatch(/^\/documents\/[^/]+$/)
  return href!.split("/").pop()!
}

test.describe("documents", () => {
  const users: TestUser[] = []

  test.afterEach(async () => {
    await disposeUsers(users.splice(0))
  })

  test("the vault is closed to anyone not signed in", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("/documents")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fdocuments")

    await page.goto("/documents/some-document-id")
    await expect(page).toHaveURL("/login?callbackUrl=%2Fdocuments%2Fsome-document-id")

    // NOT a redirect, deliberately (§11): the file route is left out of the
    // proxy matcher because the URL is loaded inside an <object> and an <img>,
    // where a redirect renders the login page inside the preview frame. Its own
    // auth() call answers 404 instead.
    const file = await page.request.get("/api/documents/some-document-id/file")
    expect(file.status()).toBe(404)

    await context.close()
  })

  test("an uploaded PDF is listed, previewed, served and searchable", async ({ browser }) => {
    const user = await signUpUser(browser, "documents")
    users.push(user)
    const { page } = user
    const suffix = uniqueSuffix()
    const offerTitle = `Offer letter ${suffix}`
    const payslipTitle = `Payslip ${suffix}`

    await page.goto("/documents")
    await expect(page.getByRole("heading", { name: "Nothing in your vault yet" })).toBeVisible()

    await uploadDocument(page, {
      file: OFFER_PDF,
      title: offerTitle,
      tags: ["offer letter", "acme"],
    })

    // Navigate afresh so the assertions re-run the Server Component against the
    // database. Asserting the DOM the upload left behind would pass even if
    // nothing had been written.
    await page.goto("/documents")
    const row = page.getByRole("row", { name: new RegExp(offerTitle) })
    await expect(row).toBeVisible()
    await expect(row).toContainText("offer letter")
    await expect(row).toContainText("acme")
    await expect(row).toContainText("offer-letter.pdf")
    await expect(row).toContainText("PDF")

    const documentId = await documentIdByTitle(page, offerTitle)
    await page.goto(`/documents/${documentId}`)
    await expect(page.getByRole("heading", { name: offerTitle, level: 1 })).toBeVisible()

    const fileHref = `/api/documents/${documentId}/file`
    await expect(page.locator(`object[data="${fileHref}"]`)).toHaveAttribute(
      "type",
      "application/pdf"
    )

    // The bytes survived the round trip through storage and back out of the
    // authorising route — not just the row.
    const served = await page.request.get(fileHref)
    expect(served.status()).toBe(200)
    const headers = served.headers()
    // The literal registry value, never the string the browser declared.
    expect(headers["content-type"]).toBe("application/pdf")
    expect(headers["x-content-type-options"]).toBe("nosniff")
    expect(headers["content-disposition"]).toBe(
      `inline; filename="offer-letter.pdf"; filename*=UTF-8''offer-letter.pdf`
    )
    expect(headers["cache-control"]).toBe("private, no-store")
    expect((await served.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-")

    const downloaded = await page.request.get(`${fileHref}?download=1`)
    expect(downloaded.headers()["content-disposition"]).toContain("attachment;")

    await page.goto("/documents")
    await uploadDocument(page, { file: OFFER_PDF, title: payslipTitle, tags: ["payslip"] })

    // Search narrows to the one row, and the assertion names the row that has
    // to disappear — a search that returned everything would pass a bare
    // "the offer is visible" check.
    await page.goto("/documents")
    await page.getByLabel("Search documents").fill(`Offer letter ${suffix}`)
    await page.getByRole("button", { name: "Search" }).click()
    await expect(documentRows(page)).toHaveCount(1)
    await expect(page.getByRole("row", { name: new RegExp(offerTitle) })).toBeVisible()
    await expect(page.getByText(payslipTitle)).toHaveCount(0)

    // A term that matches nothing gets the "no matches" state, NOT the "your
    // vault is empty" one — a user with documents and a typo must never be told
    // their vault is empty.
    await page.goto("/documents")
    await page.getByLabel("Search documents").fill(`no-such-document-${suffix}`)
    await page.getByRole("button", { name: "Search" }).click()
    await expect(
      page.getByRole("heading", { name: `No documents match “no-such-document-${suffix}”` })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Nothing in your vault yet" })).toHaveCount(0)

    // Tags narrow rather than widen: the second one matches fewer documents
    // than the first, not more.
    await page.goto("/documents?tag=offer+letter")
    await expect(documentRows(page)).toHaveCount(1)
    await expect(page.getByRole("row", { name: new RegExp(offerTitle) })).toBeVisible()

    await page.goto("/documents?tag=offer+letter&tag=payslip")
    await expect(documentRows(page)).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "No documents match those tags" })).toBeVisible()
  })

  test("an image upload renders a preview whose bytes actually decoded", async ({ browser }) => {
    const user = await signUpUser(browser, "documents-image")
    users.push(user)
    const { page } = user
    const title = `Certificate ${uniqueSuffix()}`

    await page.goto("/documents")
    await uploadDocument(page, { file: CERTIFICATE_PNG, title })

    await page.goto("/documents")
    const documentId = await documentIdByTitle(page, title)
    await page.goto(`/documents/${documentId}`)

    const image = page.locator(`img[src="/api/documents/${documentId}/file"]`)
    await expect(image).toBeVisible()
    // The only assertion that proves the bytes decoded rather than that an
    // <img> tag exists: a 404 or a truncated file leaves naturalWidth at 0.
    await expect
      .poll(async () => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)

    expect(
      (await page.request.get(`/api/documents/${documentId}/file`)).headers()["content-type"]
    ).toBe("image/png")
  })

  test("the bytes decide what a file is, not its name or its declared type", async ({
    browser,
  }) => {
    const user = await signUpUser(browser, "documents-bytes")
    users.push(user)
    const { page } = user
    const userId = await userIdFor(user.email)
    const title = `Definitely a PNG ${uniqueSuffix()}`

    await page.goto("/documents")
    const sheet = await openUploadSheet(page)
    await fillUpload(sheet, { file: HTML_NAMED_PNG, title })

    // Wait for the POST rather than trusting that the click produced one: this
    // file passes every client-side check, so a rejection that never reached
    // the server would prove nothing about the signature check.
    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/documents")
    )
    await sheet.getByRole("button", { name: "Upload document" }).click()
    expect((await posted).status()).toBe(200)

    // The server's wording, with the full stop. The sheet's own message is
    // "Upload a PDF, PNG, JPEG or WebP file" without one, so this string can
    // only have come from UnsupportedFileTypeError — i.e. from the code that
    // read the bytes.
    await expect(sheet.getByRole("alert")).toHaveText("Upload a PDF, PNG, JPEG or WebP file.")
    await expect(sheet).toBeVisible()
    expect(await prisma.document.count({ where: { userId } })).toBe(0)

    // The control. Same sheet, same title, same .png extension, same declared
    // type — only the bytes differ, and this one is accepted. Without it the
    // refusal above could be down to a broken form rather than the signature
    // check.
    await sheet.getByLabel("File").setInputFiles(CERTIFICATE_PNG)
    await sheet.getByRole("button", { name: "Upload document" }).click()
    await expect(sheet).toHaveCount(0)
    expect(await prisma.document.count({ where: { userId } })).toBe(1)
  })

  test("SVG is refused by the server, not merely by the file picker", async ({ browser }) => {
    const user = await signUpUser(browser, "documents-svg")
    users.push(user)
    const { page } = user
    const userId = await userIdFor(user.email)

    await recordServerActionRequests(page)
    await page.goto("/documents")
    const sheet = await openUploadSheet(page)
    await fillUpload(sheet, { file: SVG, title: `Diagram ${uniqueSuffix()}` })
    await sheet.getByRole("button", { name: "Upload document" }).click()
    // The picker's own check fires first — "image/svg+xml" is not in the accept
    // list — so this never reaches the network.
    await expect(sheet.getByRole("alert")).toHaveText("Upload a PDF, PNG, JPEG or WebP file")
    expect(await prisma.document.count({ where: { userId } })).toBe(0)

    // Which is exactly why the server is asked directly. An SVG is a scripted
    // document format, and served from our own origin its script would run with
    // our session (§8.2); if anyone ever adds it to the registry, this fails
    // loudly rather than the UI quietly starting to accept it. One real upload
    // first, so the replay below carries the same encoding the form produces.
    await sheet.getByLabel("File").setInputFiles(CERTIFICATE_PNG)
    await sheet.getByRole("button", { name: "Upload document" }).click()
    await expect(sheet).toHaveCount(0)
    expect(await prisma.document.count({ where: { userId } })).toBe(1)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`
    // Declared honestly, then declared as a PNG: the first is refused by the
    // allow-list, the second by the signature check, and neither may write a
    // row.
    for (const mimeType of ["image/svg+xml", "image/png"]) {
      const response = await replayUploadAction(page, {
        fields: { title: `SVG as ${mimeType}` },
        filename: "diagram.svg",
        mimeType,
        content: svg,
      })
      expect(response.status).toBe(200)
      expect(response.body).toContain("Upload a PDF, PNG, JPEG or WebP file")
      expect(await prisma.document.count({ where: { userId } })).toBe(1)
    }
  })

  test("an oversized upload is refused by the server and writes no row", async ({ browser }) => {
    const user = await signUpUser(browser, "documents-size")
    users.push(user)
    const { page } = user
    const userId = await userIdFor(user.email)
    const suffix = uniqueSuffix()

    await recordServerActionRequests(page)
    await page.goto("/documents")
    const sheet = await openUploadSheet(page)
    await fillUpload(sheet, { file: OFFER_PDF, title: `Baseline ${suffix}` })
    await sheet.getByRole("button", { name: "Upload document" }).click()
    await expect(sheet).toHaveCount(0)
    expect(await prisma.document.count({ where: { userId } })).toBe(1)

    // A 2MB body, sent at the Server Action boundary rather than through the
    // form, is the case that used to fail: Next's default Server Actions body
    // limit is 1mb, and `proxyClientMaxBodySize` silently TRUNCATES rather than
    // refusing, which stored a corrupt file with a row pointing at it and no
    // error anywhere. The digest comparison is what catches that — a size check
    // alone would pass against bytes that arrived short but were stored short
    // too.
    const largeTitle = `Large upload ${suffix}`
    const large = pdfOfSize(2 * 1024 * 1024)
    const accepted = await replayUploadAction(page, {
      fields: { title: largeTitle },
      filename: "large.pdf",
      mimeType: "application/pdf",
      content: PDF_HEADER,
      padToBytes: large.byteLength,
    })
    expect(accepted.status).toBe(200)
    expect(accepted.body).not.toContain("larger than")

    const stored = await prisma.document.findFirst({ where: { userId, title: largeTitle } })
    expect(stored, "the 2MB upload was refused or never written").not.toBeNull()
    expect(stored!.sizeBytes).toBe(large.byteLength)
    const servedBack = await page.request.get(`/api/documents/${stored!.id}/file`)
    expect(servedBack.status()).toBe(200)
    expect(sha256(await servedBack.body())).toBe(sha256(large))

    // One byte over the cap. It has to be OUR refusal, by name, and no row.
    const oversizeTitle = `Oversize ${suffix}`
    const oversize = pdfOfSize(MAX_UPLOAD_BYTES + 1024)
    const refused = await replayUploadAction(page, {
      fields: { title: oversizeTitle },
      filename: "oversize.pdf",
      mimeType: "application/pdf",
      content: PDF_HEADER,
      padToBytes: oversize.byteLength,
    })
    expect(refused.status).toBe(200)
    expect(refused.body).toContain("This file is larger than 10MB")
    expect(await prisma.document.count({ where: { userId, title: oversizeTitle } })).toBe(0)
    expect(await prisma.document.count({ where: { userId } })).toBe(2)

    // And the same file through the form, where the client check catches it
    // first so the user is told before spending ten megabytes of upload.
    await page.goto("/documents")
    const oversizeSheet = await openUploadSheet(page)
    await oversizeSheet.getByLabel("File").setInputFiles({
      name: "oversize.pdf",
      mimeType: "application/pdf",
      buffer: oversize,
    })
    await oversizeSheet.getByLabel("Title").fill(`Form oversize ${suffix}`)
    await oversizeSheet.getByRole("button", { name: "Upload document" }).click()
    await expect(oversizeSheet.getByRole("alert")).toHaveText("This file is larger than 10MB")
    expect(await prisma.document.count({ where: { userId } })).toBe(2)
  })

  test("metadata is editable, clearable, and survives its company", async ({ browser }) => {
    const user = await signUpUser(browser, "documents-edit")
    users.push(user)
    const { page } = user
    const userId = await userIdFor(user.email)
    const suffix = uniqueSuffix()
    const company = `Acme ${suffix}`
    const title = `Contract ${suffix}`
    const renamed = `Signed contract ${suffix}`

    // Seeded rather than created through /companies: the company list is
    // another phase's surface, and what is under test here is the vault's own
    // link, unlink and survive-the-company behaviour.
    const companyRow = await prisma.company.create({ data: { userId, name: company } })

    await page.goto("/documents")
    const sheet = await openUploadSheet(page)
    await fillUpload(sheet, { file: OFFER_PDF, title, tags: ["contract"] })
    await sheet.getByLabel("Company").click()
    await page.getByRole("option", { name: company }).click()
    await sheet.getByLabel("Expires on").fill("2030-01-31")
    await sheet.getByLabel("Description").fill("Counter-signed original")
    await sheet.getByRole("button", { name: "Upload document" }).click()
    await expect(sheet).toHaveCount(0)

    await page.goto("/documents")
    const documentId = await documentIdByTitle(page, title)
    const created = await prisma.document.findFirstOrThrow({ where: { userId, id: documentId } })
    expect(created.description).toBe("Counter-signed original")
    expect(created.companyId).toBe(companyRow.id)

    // The company's own page lists it — the payoff for companyId being a real
    // relation rather than a string.
    await page.goto(`/companies/${companyRow.id}`)
    await expect(page.getByRole("link", { name: title })).toBeVisible()

    // Edit: rename, clear the description, and unlink the company. Prisma reads
    // `undefined` as "leave unchanged", so a cleared optional field that does
    // not land as null is the bug this asserts against — and asserting the
    // action merely succeeded would pass against it.
    await page.goto(`/documents/${documentId}`)
    await page.getByRole("button", { name: "Edit" }).click()
    const editSheet = page.getByRole("dialog")
    await editSheet.getByLabel("Title").fill(renamed)
    await editSheet.getByLabel("Description").fill("")
    await editSheet.getByLabel("Company").click()
    await page.getByRole("option", { name: "No company" }).click()
    await editSheet.getByLabel("Expires on").fill("")
    await editSheet.getByRole("button", { name: "Save changes" }).click()
    await expect(editSheet).toHaveCount(0)

    await page.goto(`/documents/${documentId}`)
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible()
    const edited = await prisma.document.findFirstOrThrow({ where: { userId, id: documentId } })
    expect(edited.title).toBe(renamed)
    expect(edited.description).toBeNull()
    expect(edited.companyId).toBeNull()
    expect(edited.expiresOn).toBeNull()

    // Re-link, then delete the company: SetNull, not Restrict — deleting a
    // company must neither refuse nor destroy a payslip.
    await page.goto(`/documents/${documentId}`)
    await page.getByRole("button", { name: "Edit" }).click()
    const relink = page.getByRole("dialog")
    await relink.getByLabel("Company").click()
    await page.getByRole("option", { name: company }).click()
    await relink.getByRole("button", { name: "Save changes" }).click()
    await expect(relink).toHaveCount(0)
    expect(
      (await prisma.document.findFirstOrThrow({ where: { userId, id: documentId } })).companyId
    ).toBe(companyRow.id)

    // The divergence from Application's `Restrict`, and the one the schema
    // comment calls out: deleting a company must neither refuse nor destroy a
    // payslip. The delete is issued at the database because that is where the
    // `SetNull` lives — the document is what is being tested.
    await prisma.company.delete({ where: { id: companyRow.id } })

    const orphaned = await prisma.document.findFirstOrThrow({ where: { userId, id: documentId } })
    expect(orphaned.companyId).toBeNull()
    await page.goto(`/documents/${documentId}`)
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible()
  })

  test("deleting a document removes the row and the stored file", async ({ browser }) => {
    const user = await signUpUser(browser, "documents-delete")
    users.push(user)
    const { page } = user
    const userId = await userIdFor(user.email)
    const title = `Payslip ${uniqueSuffix()}`

    await page.goto("/documents")
    await uploadDocument(page, { file: OFFER_PDF, title })
    await page.goto("/documents")
    const documentId = await documentIdByTitle(page, title)

    expect((await page.request.get(`/api/documents/${documentId}/file`)).status()).toBe(200)

    await page.goto(`/documents/${documentId}`)
    await page.getByRole("button", { name: "Delete" }).click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm.getByRole("heading", { name: `Delete ${title}?` })).toBeVisible()
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()

    await expect(page).toHaveURL("/documents")
    await expect(page.getByText(title)).toHaveCount(0)
    expect(await prisma.document.count({ where: { userId, id: documentId } })).toBe(0)
    // The object goes with the row: the route 404s because there is no row, and
    // there is nothing left on disk for a later id collision to serve.
    expect((await page.request.get(`/api/documents/${documentId}/file`)).status()).toBe(404)
  })

  test("one user cannot reach another user's document by its id", async ({ browser }) => {
    const owner = await signUpUser(browser, "documents-owner")
    const intruder = await signUpUser(browser, "documents-intruder")
    users.push(owner, intruder)
    const suffix = uniqueSuffix()
    const title = `Acme offer ${suffix}`

    await owner.page.goto("/documents")
    await uploadDocument(owner.page, { file: OFFER_PDF, title, tags: ["offer letter"] })
    await owner.page.goto("/documents")
    const documentId = await documentIdByTitle(owner.page, title)
    const ownerFileDigest = sha256(
      await (await owner.page.request.get(`/api/documents/${documentId}/file`)).body()
    )

    const intruderId = await userIdFor(intruder.email)
    const page = intruder.page

    // The vault is not shared, and the search is the §5.1c regression: `userId`
    // has to be a top-level filter, not one branch of the title/tag/filename OR.
    await page.goto("/documents")
    await expect(page.getByRole("heading", { name: "Nothing in your vault yet" })).toBeVisible()
    await page.goto(`/documents?q=Acme+offer+${suffix}`)
    await expect(page.getByText(title)).toHaveCount(0)

    // Not found and not yours are the same page and the same status, on
    // purpose: a different answer would be a cross-tenant read of one bit.
    await page.goto(`/documents/${documentId}`)
    await expect(page.getByRole("heading", { name: "Document not found" })).toBeVisible()
    expect((await page.request.get(`/api/documents/${documentId}/file`)).status()).toBe(404)

    // The Server Actions, which no screen would ever point at someone else's
    // row. The intruder's own document supplies the action ids.
    await page.goto("/documents")
    const mine = `Intruder document ${suffix}`
    await uploadDocument(page, { file: OFFER_PDF, title: mine })
    await page.goto("/documents")
    const mineId = await documentIdByTitle(page, mine)

    await page.goto(`/documents/${mineId}`)
    await page.getByRole("button", { name: "Edit" }).click()
    const editSheet = page.getByRole("dialog")
    await editSheet.getByLabel("Title").fill(`${mine} edited`)
    const updateAction = await captureServerAction(page, () =>
      editSheet.getByRole("button", { name: "Save changes" }).click()
    )
    await expect(editSheet).toHaveCount(0)

    const stolenUpdate = await callServerAction(page, updateAction, [
      { id: documentId, title: "Owned by the intruder", description: "", tags: [], companyId: "", expiresOn: "" },
    ])
    expect(await actionResponseText(stolenUpdate)).toContain("Document not found")

    const untouched = await prisma.document.findUniqueOrThrow({ where: { id: documentId } })
    expect(untouched.title).toBe(title)
    expect(
      sha256(await (await owner.page.request.get(`/api/documents/${documentId}/file`)).body())
    ).toBe(ownerFileDigest)

    const deleteAction = await captureServerAction(page, async () => {
      await page.goto("/documents")
      await page.getByRole("link", { name: `${mine} edited`, exact: true }).click()
      await page.getByRole("button", { name: "Delete" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click()
    })
    await expect(page).toHaveURL("/documents")
    expect(await prisma.document.count({ where: { userId: intruderId } })).toBe(0)

    const stolenDelete = await callServerAction(page, deleteAction, [{ id: documentId }])
    expect(await actionResponseText(stolenDelete)).toContain("Document not found")
    expect(await prisma.document.count({ where: { id: documentId } })).toBe(1)

    // And the shape that turned one delete into eight: an id that is not a
    // string at all. `documentIdSchema` parses it as a plain string, so a
    // filter object fails to parse instead of reaching Prisma's `where`.
    await page.goto("/documents")
    for (const decoy of ["First decoy", "Second decoy", "Third decoy"]) {
      await uploadDocument(page, { file: OFFER_PDF, title: `${decoy} ${suffix}` })
      await page.goto("/documents")
    }
    expect(await prisma.document.count({ where: { userId: intruderId } })).toBe(3)

    for (const crafted of [{ not: "" }, { contains: "" }, [documentId]]) {
      const response = await callServerAction(page, deleteAction, [{ id: crafted }])
      expect(await actionResponseText(response)).toContain("Something went wrong")
    }
    expect(await prisma.document.count({ where: { userId: intruderId } })).toBe(3)
    expect(await prisma.document.count({ where: { id: documentId } })).toBe(1)
  })
})

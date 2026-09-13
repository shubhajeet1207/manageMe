import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "@/server/files/content-types"
import {
  MAX_DOCUMENT_DESCRIPTION_LENGTH,
  MAX_DOCUMENT_TAGS,
  MAX_DOCUMENT_TITLE_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_TAG_LENGTH,
  createDocumentSchema,
  documentSearchSchema,
  updateDocumentSchema,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from "./document-schemas"

function file(
  size = 1024,
  type = "application/pdf",
  name = "offer-letter.pdf"
): File {
  return new File([new Uint8Array(size)], name, { type })
}

function createInput(overrides: Record<string, unknown> = {}) {
  return { title: "Acme offer", tags: [], file: file(), ...overrides }
}

function updateInput(overrides: Record<string, unknown> = {}) {
  return { id: "d1", title: "Acme offer", tags: [], ...overrides }
}

describe("createDocumentSchema", () => {
  it("accepts a title, an empty tag list and a PDF", () => {
    expect(createDocumentSchema.safeParse(createInput()).success).toBe(true)
  })

  it("rejects a blank title", () => {
    const result = createDocumentSchema.safeParse(createInput({ title: "   " }))
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.title?.[0]).toBe("Title is required")
  })

  it("trims the title and caps it at 200", () => {
    const result = createDocumentSchema.safeParse(createInput({ title: "  Acme offer  " }))
    expect(result.success && result.data.title).toBe("Acme offer")
    expect(
      createDocumentSchema.safeParse(createInput({ title: "a".repeat(MAX_DOCUMENT_TITLE_LENGTH + 1) }))
        .success
    ).toBe(false)
  })

  it("caps the description at 2000 characters", () => {
    expect(
      createDocumentSchema.safeParse(
        createInput({ description: "a".repeat(MAX_DOCUMENT_DESCRIPTION_LENGTH) })
      ).success
    ).toBe(true)
    expect(
      createDocumentSchema.safeParse(
        createInput({ description: "a".repeat(MAX_DOCUMENT_DESCRIPTION_LENGTH + 1) })
      ).success
    ).toBe(false)
  })

  it("lands an empty companyId as undefined, never as an empty string", () => {
    const result = createDocumentSchema.safeParse(createInput({ companyId: "" }))
    expect(result.success && result.data.companyId).toBeUndefined()
  })

  it("lands an empty expiresOn as undefined, never as an Invalid Date", () => {
    // `z.coerce.date()` turns "" into Invalid Date, so the empty-string branch
    // must be tried BEFORE coercion.
    const result = createDocumentSchema.safeParse(createInput({ expiresOn: "" }))
    expect(result.success).toBe(true)
    expect(result.success && result.data.expiresOn).toBeUndefined()
  })

  it("coerces a date string into a Date", () => {
    const result = createDocumentSchema.safeParse(createInput({ expiresOn: "2030-01-31" }))
    expect(result.success && result.data.expiresOn instanceof Date).toBe(true)
  })

  it("accepts an expiry in the past — an expired passport is exactly the document to flag", () => {
    expect(createDocumentSchema.safeParse(createInput({ expiresOn: "2001-01-31" })).success).toBe(
      true
    )
  })

  it("lands an empty description as undefined", () => {
    const result = createDocumentSchema.safeParse(createInput({ description: "" }))
    expect(result.success && result.data.description).toBeUndefined()
  })

  it("infers description, companyId and expiresOn as OPTIONAL keys", () => {
    // The Zod-4 footgun this project has hit twice: `.transform()` applied
    // after `.optional()` hides the optional marker from key inference, so the
    // keys infer as required-but-undefined. This assignment does not compile if
    // that happens — `tsc` is the assertion, and the runtime checks below keep
    // vitest honest.
    const input: CreateDocumentInput = { title: "Acme offer", tags: [], file: file() }
    expect(input.description).toBeUndefined()
    expect(input.companyId).toBeUndefined()
    expect(input.expiresOn).toBeUndefined()

    const update: UpdateDocumentInput = { id: "d1", title: "Acme offer", tags: [] }
    expect(update.description).toBeUndefined()
  })

  it("deduplicates tags case-insensitively, keeping the first spelling", () => {
    const result = createDocumentSchema.safeParse(
      createInput({ tags: ["Payslip", "Acme", "payslip"] })
    )
    expect(result.success && result.data.tags).toEqual(["Payslip", "Acme"])
  })

  it("rejects a tag longer than 30 characters", () => {
    expect(
      createDocumentSchema.safeParse(createInput({ tags: ["a".repeat(MAX_TAG_LENGTH + 1)] })).success
    ).toBe(false)
  })

  it("rejects more than 20 distinct tags", () => {
    const tags = Array.from({ length: MAX_DOCUMENT_TAGS + 1 }, (_, index) => `tag-${index}`)
    expect(createDocumentSchema.safeParse(createInput({ tags })).success).toBe(false)
  })

  it("rejects a missing file", () => {
    const result = createDocumentSchema.safeParse({ title: "Acme offer", tags: [] })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.file?.[0]).toBe("Choose a file")
  })

  it("rejects a zero-byte file", () => {
    const result = createDocumentSchema.safeParse(createInput({ file: file(0) }))
    expect(result.error?.flatten().fieldErrors.file?.[0]).toBe("Choose a file")
  })

  it("rejects a file over the 10MB cap and accepts one exactly at it", () => {
    expect(createDocumentSchema.safeParse(createInput({ file: file(MAX_UPLOAD_BYTES) })).success).toBe(
      true
    )
    const over = createDocumentSchema.safeParse(createInput({ file: file(MAX_UPLOAD_BYTES + 1) }))
    expect(over.success).toBe(false)
    expect(over.error?.flatten().fieldErrors.file?.[0]).toBe("This file is larger than 10MB")
  })

  it("accepts each allow-listed declared type", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      expect(createDocumentSchema.safeParse(createInput({ file: file(64, type) })).success).toBe(true)
    }
  })

  it("rejects a declared type outside the allow-list", () => {
    for (const type of ["image/svg+xml", "text/html", "image/heic", "application/zip"]) {
      const result = createDocumentSchema.safeParse(createInput({ file: file(64, type) }))
      expect(result.success).toBe(false)
      expect(result.error?.flatten().fieldErrors.file?.[0]).toBe(
        "Upload a PDF, PNG, JPEG or WebP file"
      )
    }
  })
})

describe("updateDocumentSchema", () => {
  it("requires an id", () => {
    expect(updateDocumentSchema.safeParse({ title: "Acme offer", tags: [] }).success).toBe(false)
  })

  it("accepts metadata with no file", () => {
    expect(updateDocumentSchema.safeParse(updateInput()).success).toBe(true)
  })

  it("has no file field: the bytes are immutable, and a second write path would need its own guard", () => {
    const result = updateDocumentSchema.safeParse(updateInput({ file: file() }))
    expect(result.success).toBe(true)
    expect(result.success && "file" in result.data).toBe(false)
  })
})

describe("documentSearchSchema", () => {
  it("defaults tags to an empty list", () => {
    const result = documentSearchSchema.safeParse({})
    expect(result.success && result.data.tags).toEqual([])
  })

  it("trims the query", () => {
    const result = documentSearchSchema.safeParse({ query: "  offer  " })
    expect(result.success && result.data.query).toBe("offer")
  })

  it("caps the query at 100 characters", () => {
    expect(
      documentSearchSchema.safeParse({ query: "a".repeat(MAX_SEARCH_QUERY_LENGTH) }).success
    ).toBe(true)
    expect(
      documentSearchSchema.safeParse({ query: "a".repeat(MAX_SEARCH_QUERY_LENGTH + 1) }).success
    ).toBe(false)
  })

  it("accepts a tag list", () => {
    const result = documentSearchSchema.safeParse({ tags: ["payslip", "2026"] })
    expect(result.success && result.data.tags).toEqual(["payslip", "2026"])
  })
})

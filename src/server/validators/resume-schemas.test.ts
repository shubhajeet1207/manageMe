import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "@/server/storage/pdf"
import {
  createResumeSchema,
  setCurrentVersionSchema,
  updateResumeSchema,
  uploadResumeVersionSchema,
  type CreateResumeInput,
} from "./resume-schemas"

function pdfFile(size = 1024, type = "application/pdf", name = "resume.pdf"): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe("createResumeSchema", () => {
  it("accepts a resume slot with only a name", () => {
    const result = createResumeSchema.safeParse({ name: "Backend SWE" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty name", () => {
    const result = createResumeSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.name?.[0]).toBe("Name is required")
  })

  it("trims whitespace from the name", () => {
    const result = createResumeSchema.safeParse({ name: "  Backend SWE  " })
    expect(result.success && result.data.name).toBe("Backend SWE")
  })

  it("rejects a name longer than 200 characters", () => {
    expect(createResumeSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false)
  })

  it("rejects notes longer than 500 characters", () => {
    // 500 matches Company.notes: the same kind of short descriptive line.
    expect(createResumeSchema.safeParse({ name: "Backend SWE", notes: "a".repeat(501) }).success).toBe(
      false
    )
    expect(createResumeSchema.safeParse({ name: "Backend SWE", notes: "a".repeat(500) }).success).toBe(
      true
    )
  })

  it("normalises empty notes to undefined", () => {
    const result = createResumeSchema.safeParse({ name: "Backend SWE", notes: "" })
    expect(result.success && result.data.notes).toBeUndefined()
  })

  it("infers notes as an OPTIONAL key, not a required one that may be undefined", () => {
    // The Zod-4 footgun this project has hit twice: `.transform()` applied
    // after `.optional()` hides the optional marker from key inference. This
    // assignment does not compile if `notes` infers as required, so `tsc`
    // is the assertion — the runtime check below just keeps vitest honest.
    const input: CreateResumeInput = { name: "Backend SWE" }
    expect(input.notes).toBeUndefined()
  })
})

describe("updateResumeSchema", () => {
  it("requires an id", () => {
    expect(updateResumeSchema.safeParse({ name: "Backend SWE" }).success).toBe(false)
  })

  it("accepts an id with a name", () => {
    expect(updateResumeSchema.safeParse({ id: "r1", name: "Backend SWE" }).success).toBe(true)
  })
})

describe("uploadResumeVersionSchema", () => {
  it("accepts a labelled PDF upload", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "October rewrite",
      file: pdfFile(),
    })
    expect(result.success).toBe(true)
  })

  it("rejects a blank label — the client's filename-stem default is a client convenience", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "   ",
      file: pdfFile(),
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.label?.[0]).toBe("Label is required")
  })

  it("rejects a label longer than 100 characters", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "a".repeat(101),
      file: pdfFile(),
    })
    expect(result.success).toBe(false)
  })

  it("rejects a missing resumeId", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "",
      label: "October",
      file: pdfFile(),
    })
    expect(result.success).toBe(false)
  })

  it("rejects a value that is not a File", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "October",
      file: "resumes/../../etc/passwd",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty file", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "October",
      file: pdfFile(0),
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.file?.[0]).toBe("Choose a file")
  })

  it("rejects a file over the 10MB cap", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "October",
      file: pdfFile(MAX_UPLOAD_BYTES + 1),
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.file).toContain("This file is larger than 10MB")
  })

  it("rejects a declared content type that is not application/pdf", () => {
    const result = uploadResumeVersionSchema.safeParse({
      resumeId: "r1",
      label: "October",
      file: pdfFile(1024, "text/html", "resume.pdf"),
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.file).toContain("Only PDF files are supported")
  })
})

describe("setCurrentVersionSchema", () => {
  it("accepts a resume and version id", () => {
    expect(setCurrentVersionSchema.safeParse({ resumeId: "r1", versionId: "v1" }).success).toBe(true)
  })

  it("rejects a missing version id", () => {
    expect(setCurrentVersionSchema.safeParse({ resumeId: "r1", versionId: "" }).success).toBe(false)
  })
})

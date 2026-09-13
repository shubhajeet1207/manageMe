import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "@/server/files/pdf"
import {
  MAX_RESUME_SKILLS,
  MAX_SKILL_LENGTH,
  createResumeProjectSchema,
  createResumeSchema,
  reorderResumeProjectsSchema,
  setCurrentVersionSchema,
  setResumeSkillsSchema,
  updateResumeProjectSchema,
  updateResumeSchema,
  uploadResumeVersionSchema,
  type CreateResumeInput,
  type CreateResumeProjectInput,
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

describe("setResumeSkillsSchema", () => {
  it("accepts a list of skills", () => {
    const result = setResumeSkillsSchema.safeParse({
      resumeId: "r1",
      skills: ["Kubernetes", "Go", "Postgres"],
    })
    expect(result.success && result.data.skills).toEqual(["Kubernetes", "Go", "Postgres"])
  })

  it("accepts an empty list — clearing every skill is a legitimate edit", () => {
    const result = setResumeSkillsSchema.safeParse({ resumeId: "r1", skills: [] })
    expect(result.success && result.data.skills).toEqual([])
  })

  it("trims each skill", () => {
    const result = setResumeSkillsSchema.safeParse({ resumeId: "r1", skills: ["  Go  "] })
    expect(result.success && result.data.skills).toEqual(["Go"])
  })

  it("rejects a blank skill", () => {
    const result = setResumeSkillsSchema.safeParse({ resumeId: "r1", skills: ["Go", "   "] })
    expect(result.success).toBe(false)
  })

  it("rejects a skill longer than 50 characters and accepts exactly 50", () => {
    expect(
      setResumeSkillsSchema.safeParse({ resumeId: "r1", skills: ["a".repeat(MAX_SKILL_LENGTH + 1)] })
        .success
    ).toBe(false)
    expect(
      setResumeSkillsSchema.safeParse({ resumeId: "r1", skills: ["a".repeat(MAX_SKILL_LENGTH)] })
        .success
    ).toBe(true)
  })

  it("deduplicates case-insensitively, keeping the first spelling typed", () => {
    const result = setResumeSkillsSchema.safeParse({
      resumeId: "r1",
      skills: ["React", "Go", "react", "  REACT  "],
    })
    expect(result.success && result.data.skills).toEqual(["React", "Go"])
  })

  it("counts the cap AFTER deduplication", () => {
    // 51 entries, one of them a repeat: 50 skills are stored, so this is
    // within the cap rather than one over it.
    const skills = [
      ...Array.from({ length: MAX_RESUME_SKILLS }, (_, index) => `skill-${index}`),
      "SKILL-0",
    ]
    expect(setResumeSkillsSchema.safeParse({ resumeId: "r1", skills }).success).toBe(true)
  })

  it("rejects more than 50 distinct skills", () => {
    const skills = Array.from({ length: MAX_RESUME_SKILLS + 1 }, (_, index) => `skill-${index}`)
    const result = setResumeSkillsSchema.safeParse({ resumeId: "r1", skills })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.skills?.[0]).toBe("Add at most 50 skills")
  })

  it("rejects a missing resumeId", () => {
    expect(setResumeSkillsSchema.safeParse({ resumeId: "", skills: ["Go"] }).success).toBe(false)
  })
})

describe("createResumeProjectSchema", () => {
  it("accepts a project with only a name", () => {
    expect(
      createResumeProjectSchema.safeParse({ resumeId: "r1", name: "Pipeline rewrite" }).success
    ).toBe(true)
  })

  it("rejects an empty name", () => {
    const result = createResumeProjectSchema.safeParse({ resumeId: "r1", name: "  " })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.name?.[0]).toBe("Name is required")
  })

  it("rejects a name longer than 200 characters", () => {
    expect(
      createResumeProjectSchema.safeParse({ resumeId: "r1", name: "a".repeat(201) }).success
    ).toBe(false)
  })

  it("rejects a description longer than 2000 characters and accepts exactly 2000", () => {
    const base = { resumeId: "r1", name: "Pipeline" }
    expect(
      createResumeProjectSchema.safeParse({ ...base, description: "a".repeat(2001) }).success
    ).toBe(false)
    expect(
      createResumeProjectSchema.safeParse({ ...base, description: "a".repeat(2000) }).success
    ).toBe(true)
  })

  it("normalises an empty description and url to undefined", () => {
    const result = createResumeProjectSchema.safeParse({
      resumeId: "r1",
      name: "Pipeline",
      description: "",
      url: "",
    })
    expect(result.success && result.data.description).toBeUndefined()
    expect(result.success && result.data.url).toBeUndefined()
  })

  it("accepts an http and an https url", () => {
    const base = { resumeId: "r1", name: "Pipeline" }
    expect(createResumeProjectSchema.safeParse({ ...base, url: "https://a.example" }).success).toBe(
      true
    )
    expect(createResumeProjectSchema.safeParse({ ...base, url: "http://a.example" }).success).toBe(
      true
    )
  })

  it("rejects a url that is not http or https", () => {
    const base = { resumeId: "r1", name: "Pipeline" }
    // `url()` alone accepts any scheme, and this one would flow into an <a href>.
    expect(
      createResumeProjectSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success
    ).toBe(false)
    expect(createResumeProjectSchema.safeParse({ ...base, url: "not a url" }).success).toBe(false)
  })

  it("rejects a missing resumeId", () => {
    expect(createResumeProjectSchema.safeParse({ resumeId: "", name: "Pipeline" }).success).toBe(
      false
    )
  })

  it("infers description and url as OPTIONAL keys, not required ones that may be undefined", () => {
    // The Zod-4 footgun: `.transform()` applied after `.optional()` hides the
    // optional marker from key inference. This assignment does not compile if
    // either key infers as required, so `tsc` is the assertion.
    const input: CreateResumeProjectInput = { resumeId: "r1", name: "Pipeline" }
    expect(input.description).toBeUndefined()
    expect(input.url).toBeUndefined()
  })
})

describe("updateResumeProjectSchema", () => {
  it("requires an id", () => {
    expect(updateResumeProjectSchema.safeParse({ name: "Pipeline" }).success).toBe(false)
  })

  it("accepts an id with a name", () => {
    expect(updateResumeProjectSchema.safeParse({ id: "p1", name: "Pipeline" }).success).toBe(true)
  })

  it("takes no resumeId — a project cannot be moved between slots", () => {
    const result = updateResumeProjectSchema.safeParse({
      id: "p1",
      name: "Pipeline",
      resumeId: "someone-elses-resume",
    })
    expect(result.success && "resumeId" in result.data).toBe(false)
  })
})

describe("reorderResumeProjectsSchema", () => {
  it("accepts a resume id and an ordered list of project ids", () => {
    expect(
      reorderResumeProjectsSchema.safeParse({ resumeId: "r1", projectIds: ["p2", "p1"] }).success
    ).toBe(true)
  })

  it("rejects an empty list and a blank id", () => {
    expect(reorderResumeProjectsSchema.safeParse({ resumeId: "r1", projectIds: [] }).success).toBe(
      false
    )
    expect(
      reorderResumeProjectsSchema.safeParse({ resumeId: "r1", projectIds: [""] }).success
    ).toBe(false)
  })
})

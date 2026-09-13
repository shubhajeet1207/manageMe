"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  createResumeProjectSchema,
  createResumeSchema,
  resumeIdSchema,
  resumeProjectIdSchema,
  setCurrentVersionSchema,
  setResumeSkillsSchema,
  updateResumeProjectSchema,
  updateResumeSchema,
  uploadResumeVersionSchema,
} from "@/server/validators/resume-schemas"
import {
  FileTooLargeError,
  InvalidPdfError,
  ResumeInUseError,
  ResumeNameTakenError,
  ResumeNotFoundError,
  ResumeProjectNotFoundError,
  ResumeVersionNotFoundError,
  StorageError,
  createResume,
  createResumeProject,
  deleteResume,
  deleteResumeProject,
  getResumeProject,
  setCurrentVersion,
  setResumeSkills,
  updateResume,
  updateResumeProject,
  uploadResumeVersion,
} from "@/server/services/resume-service"
import type { ActionResult } from "@/types/action-result"

// Every action calls auth() itself. Route protection guards navigation; an
// action is reachable directly, so the session check is the control here and
// the user id always comes from the session, never from the payload.

export async function createResumeAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createResumeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createResume(session.user.id, parsed.data)
    revalidatePath("/resumes")
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateResumeAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateResumeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateResume(session.user.id, id, data)
    revalidatePath("/resumes")
    revalidatePath(`/resumes/${id}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    if (error instanceof ResumeNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteResumeAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // Parsed to a plain string: a Server Action argument is untrusted input, and
  // a filter object here would let Prisma's `deleteMany` match more than one
  // row.
  const parsed = resumeIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteResume(session.user.id, parsed.data.id)
    revalidatePath("/resumes")
    return { success: true }
  } catch (error) {
    // ResumeInUseError's message names the count. The dialog renders it inline
    // rather than as a toast, so it stays on screen while the user decides.
    if (error instanceof ResumeInUseError || error instanceof ResumeNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

/**
 * Takes FormData because a file cannot cross the action boundary any other
 * way. The client's size and type checks are UX; this is the authority, and
 * the magic-byte check inside the service is what actually decides (§8.2).
 */
export async function uploadResumeVersionAction(formData: FormData): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = uploadResumeVersionSchema.safeParse({
    resumeId: formData.get("resumeId"),
    label: formData.get("label"),
    file: formData.get("file"),
  })
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { resumeId, label, file } = parsed.data
  const bytes = new Uint8Array(await file.arrayBuffer())

  try {
    await uploadResumeVersion(session.user.id, {
      resumeId,
      label,
      originalFilename: file.name,
      declaredContentType: file.type,
      bytes,
    })
    revalidatePath("/resumes")
    revalidatePath(`/resumes/${resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof InvalidPdfError || error instanceof FileTooLargeError) {
      return { success: false, fieldErrors: { file: [error.message] } }
    }
    if (error instanceof ResumeNotFoundError || error instanceof StorageError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function setCurrentVersionAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = setCurrentVersionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "That version is not valid." }
  }

  const { resumeId, versionId } = parsed.data
  try {
    await setCurrentVersion(session.user.id, resumeId, versionId)
    revalidatePath("/resumes")
    revalidatePath(`/resumes/${resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeNotFoundError || error instanceof ResumeVersionNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

/**
 * The list is authoritative — what it omits is removed — so the client sends
 * the whole set, not a delta. The schema deduplicates case-insensitively;
 * the editor refuses a clashing tag before it gets here so the user is told
 * rather than watching one silently vanish.
 */
export async function setResumeSkillsAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = setResumeSkillsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { resumeId, skills } = parsed.data
  try {
    await setResumeSkills(session.user.id, resumeId, skills)
    // Both paths: the library lists a resume's first few skills beside it.
    revalidatePath("/resumes")
    revalidatePath(`/resumes/${resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function createResumeProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createResumeProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    // `resumeId` is client input; the service's assertResumeOwned is what stops
    // a project being hung off someone else's slot.
    await createResumeProject(session.user.id, parsed.data)
    revalidatePath(`/resumes/${parsed.data.resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateResumeProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateResumeProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    // Read first, for the resumeId: the payload deliberately carries none, so
    // there is no other way to name the page to revalidate. The read is scoped
    // to the session's user, as the update itself is.
    const project = await getResumeProject(session.user.id, id)
    await updateResumeProject(session.user.id, id, data)
    revalidatePath(`/resumes/${project.resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeProjectNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteResumeProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // Parsed to a plain string: a Server Action argument is untrusted input, and
  // a filter object here would let Prisma's `deleteMany` match more than one
  // row.
  const parsed = resumeProjectIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    const project = await getResumeProject(session.user.id, parsed.data.id)
    await deleteResumeProject(session.user.id, parsed.data.id)
    revalidatePath(`/resumes/${project.resumeId}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ResumeProjectNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  applicationIdSchema,
  createApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
} from "@/server/validators/application-schemas"
import { ResumeVersionNotOwnedError } from "@/server/services/resume-service"
import {
  ApplicationNotFoundError,
  CompanyNotOwnedError,
  changeStatus,
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/server/services/application-service"
import type { ActionResult } from "@/types/action-result"

function revalidateAll() {
  revalidatePath("/applications")
  revalidatePath("/companies")
}

export async function createApplicationAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createApplication(session.user.id, parsed.data)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNotOwnedError) {
      return { success: false, fieldErrors: { companyId: [error.message] } }
    }
    // "Resume not found", deliberately: the message must not confirm that
    // someone else's version exists.
    if (error instanceof ResumeVersionNotOwnedError) {
      return { success: false, fieldErrors: { resumeVersionId: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateApplicationAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateApplication(session.user.id, id, data)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNotOwnedError) {
      return { success: false, fieldErrors: { companyId: [error.message] } }
    }
    if (error instanceof ResumeVersionNotOwnedError) {
      return { success: false, fieldErrors: { resumeVersionId: [error.message] } }
    }
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function changeStatusAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "That status is not valid." }
  }

  try {
    await changeStatus(session.user.id, parsed.data.id, parsed.data.status)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Could not move that application." }
  }
}

export async function deleteApplicationAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // Parsed to a plain string: a Server Action argument is untrusted input, and
  // a filter object here would let Prisma's `deleteMany` match more than one
  // row.
  const parsed = applicationIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteApplication(session.user.id, parsed.data.id)
    revalidateAll()
    return { success: true }
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

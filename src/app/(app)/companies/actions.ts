"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  companyIdSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@/server/validators/company-schemas"
import {
  CompanyHasApplicationsError,
  CompanyNameTakenError,
  CompanyNotFoundError,
  createCompany,
  deleteCompany,
  updateCompany,
} from "@/server/services/company-service"
import type { ActionResult } from "@/types/action-result"

export async function createCompanyAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createCompany(session.user.id, parsed.data)
    revalidatePath("/companies")
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateCompanyAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateCompany(session.user.id, id, data)
    revalidatePath("/companies")
    revalidatePath(`/companies/${id}`)
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    if (error instanceof CompanyNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteCompanyAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // Parsed to a plain string: a Server Action argument is untrusted input, and
  // a filter object here would let Prisma's `deleteMany` match more than one
  // row.
  const parsed = companyIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteCompany(session.user.id, parsed.data.id)
    revalidatePath("/companies")
    return { success: true }
  } catch (error) {
    if (error instanceof CompanyHasApplicationsError) {
      return { success: false, formError: error.message }
    }
    if (error instanceof CompanyNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

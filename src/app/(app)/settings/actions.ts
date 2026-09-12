"use server"

import type { ActionResult } from "@/types/action-result"
import { auth } from "@/lib/auth/auth"
import {
  changePasswordSchema,
  updateProfileSchema,
} from "@/server/validators/auth-schemas"
import {
  InvalidCurrentPasswordError,
  changePassword,
  updateProfile,
} from "@/server/services/auth-service"

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await updateProfile(session.user.id, parsed.data.name)
    return { success: true }
  } catch {
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword)
    return { success: true }
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) {
      return { success: false, fieldErrors: { currentPassword: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

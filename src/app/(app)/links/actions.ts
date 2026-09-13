"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  LinkNotFoundError,
  createLink,
  deleteLink,
  updateLink,
} from "@/server/services/link-service"
import {
  createLinkSchema,
  linkIdSchema,
  updateLinkSchema,
} from "@/server/validators/link-schemas"
import type { ActionResult } from "@/types/action-result"

export async function createLinkAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createLink(session.user.id, parsed.data)
    revalidatePath("/links")
    return { success: true }
  } catch {
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateLinkAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateLink(session.user.id, id, data)
    revalidatePath("/links")
    return { success: true }
  } catch (error) {
    if (error instanceof LinkNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteLinkAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = linkIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteLink(session.user.id, parsed.data.id)
    revalidatePath("/links")
    return { success: true }
  } catch (error) {
    if (error instanceof LinkNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

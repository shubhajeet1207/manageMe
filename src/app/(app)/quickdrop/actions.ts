"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { ApplicationNotOwnedError } from "@/server/services/application-service"
import { ProjectNameTakenError, ProjectNotOwnedError } from "@/server/services/project-service"
import {
  QuickDropItemNotFoundError,
  captureQuickDropItem,
  dismissQuickDropItem,
  triageQuickDropToLink,
  triageQuickDropToProject,
  triageQuickDropToTask,
} from "@/server/services/quick-drop-service"
import {
  createQuickDropSchema,
  quickDropIdSchema,
  triageToLinkSchema,
  triageToProjectSchema,
  triageToTaskSchema,
} from "@/server/validators/quick-drop-schemas"
import type { ActionResult } from "@/types/action-result"

/** The inbox, the sidebar count, and whichever list the item just became. */
function revalidateInbox(): void {
  revalidatePath("/quickdrop")
  revalidatePath("/", "layout")
}

export async function captureQuickDropAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createQuickDropSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await captureQuickDropItem(session.user.id, parsed.data)
    revalidateInbox()
    return { success: true }
  } catch {
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function dismissQuickDropAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = quickDropIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await dismissQuickDropItem(session.user.id, parsed.data.id)
    revalidateInbox()
    return { success: true }
  } catch (error) {
    if (error instanceof QuickDropItemNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function triageQuickDropToTaskAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = triageToTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await triageQuickDropToTask(session.user.id, parsed.data)
    revalidateInbox()
    revalidatePath("/tasks")
    return { success: true }
  } catch (error) {
    if (error instanceof ProjectNotOwnedError) {
      return { success: false, fieldErrors: { projectId: [error.message] } }
    }
    if (error instanceof ApplicationNotOwnedError) {
      return { success: false, fieldErrors: { applicationId: [error.message] } }
    }
    if (error instanceof QuickDropItemNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function triageQuickDropToLinkAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = triageToLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await triageQuickDropToLink(session.user.id, parsed.data)
    revalidateInbox()
    revalidatePath("/links")
    return { success: true }
  } catch (error) {
    if (error instanceof QuickDropItemNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function triageQuickDropToProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = triageToProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await triageQuickDropToProject(session.user.id, parsed.data)
    revalidateInbox()
    revalidatePath("/projects")
    return { success: true }
  } catch (error) {
    if (error instanceof ProjectNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    if (error instanceof QuickDropItemNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

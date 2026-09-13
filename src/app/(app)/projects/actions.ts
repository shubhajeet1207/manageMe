"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@/server/validators/project-schemas"
import {
  ProjectNameTakenError,
  ProjectNotFoundError,
  createProject,
  deleteProject,
  updateProject,
} from "@/server/services/project-service"
import type { ActionResult } from "@/types/action-result"

export async function createProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createProject(session.user.id, parsed.data)
    revalidatePath("/projects")
    return { success: true }
  } catch (error) {
    if (error instanceof ProjectNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function updateProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateProject(session.user.id, id, data)
    revalidatePath("/projects")
    revalidatePath(`/projects/${id}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ProjectNameTakenError) {
      return { success: false, fieldErrors: { name: [error.message] } }
    }
    if (error instanceof ProjectNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteProjectAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // Parsed to a plain string, like every other delete action's id: a Server
  // Action argument is untrusted input, and a filter object here would let
  // Prisma's `deleteMany` match more than the one row the caller meant.
  const parsed = projectIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    // The project's tasks are unlinked rather than deleted: `Task.project` is
    // `onDelete: SetNull`, so the sentence the user typed survives (§7.4).
    await deleteProject(session.user.id, parsed.data.id)
    revalidatePath("/projects")
    revalidatePath("/tasks")
    return { success: true }
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

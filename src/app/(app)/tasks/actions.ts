"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { ApplicationNotOwnedError } from "@/server/services/application-service"
import { ProjectNotOwnedError } from "@/server/services/project-service"
import {
  TaskNotFoundError,
  createTask,
  deleteTask,
  quickAddTask,
  setTaskDone,
  updateTask,
} from "@/server/services/task-service"
import {
  createTaskSchema,
  quickAddTaskSchema,
  setTaskDoneSchema,
  taskIdSchema,
  updateTaskSchema,
} from "@/server/validators/task-schemas"
import type { ActionResult } from "@/types/action-result"

/** Every surface a task can appear on. A task is deliberately reachable from
 *  four places, so a write on any of them has to refresh all of them. */
function revalidateTaskSurfaces(): void {
  revalidatePath("/tasks")
  revalidatePath("/projects")
  revalidatePath("/applications")
}

/** The two `NotOwned` errors carry the not-found wording on purpose: a refused
 *  id must not confirm that the row exists (§12.2). */
function mapLinkErrors(error: unknown): ActionResult | null {
  if (error instanceof ProjectNotOwnedError) {
    return { success: false, fieldErrors: { projectId: [error.message] } }
  }
  if (error instanceof ApplicationNotOwnedError) {
    return { success: false, fieldErrors: { applicationId: [error.message] } }
  }
  return null
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createTask(session.user.id, parsed.data)
    revalidateTaskSurfaces()
    return { success: true }
  } catch (error) {
    return (
      mapLinkErrors(error) ?? {
        success: false,
        formError: "Something went wrong. Please try again.",
      }
    )
  }
}

export async function quickAddTaskAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = quickAddTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await quickAddTask(session.user.id, parsed.data)
    revalidateTaskSurfaces()
    return { success: true }
  } catch (error) {
    return (
      mapLinkErrors(error) ?? {
        success: false,
        formError: "Something went wrong. Please try again.",
      }
    )
  }
}

export async function updateTaskAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateTask(session.user.id, id, data)
    revalidateTaskSurfaces()
    return { success: true }
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      return { success: false, formError: error.message }
    }
    return (
      mapLinkErrors(error) ?? {
        success: false,
        formError: "Something went wrong. Please try again.",
      }
    )
  }
}

export async function setTaskDoneAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = setTaskDoneSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await setTaskDone(session.user.id, parsed.data.id, parsed.data.done)
    revalidateTaskSurfaces()
    return { success: true }
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

export async function deleteTaskAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = taskIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteTask(session.user.id, parsed.data.id)
    revalidateTaskSurfaces()
    return { success: true }
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

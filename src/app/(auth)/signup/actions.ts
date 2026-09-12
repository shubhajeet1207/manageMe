"use server"

import type { ActionResult } from "@/types/action-result"
import { signupSchema } from "@/server/validators/auth-schemas"
import { EmailAlreadyExistsError, createUser } from "@/server/services/auth-service"
import { signIn } from "@/lib/auth/auth"

export async function signupAction(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  try {
    await createUser(parsed.data)
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return { success: false, fieldErrors: { email: [error.message] } }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  })

  return { success: true }
}

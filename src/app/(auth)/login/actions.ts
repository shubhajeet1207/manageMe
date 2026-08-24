"use server"

import { AuthError } from "next-auth"
import { loginSchema } from "@/server/validators/auth-schemas"
import { signIn } from "@/lib/auth/auth"

export type LoginResult = { success: true } | { success: false; formError: string }

export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Enter a valid email and password." }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, formError: "Invalid email or password." }
    }
    throw error
  }
}

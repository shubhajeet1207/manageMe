"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import { findOrCreateByName } from "@/server/services/company-service"

export async function resolveCompanyAction(
  name: string
): Promise<{ id: string } | { error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized." }

  const trimmed = name.trim()
  if (!trimmed) return { error: "Company name is required" }

  try {
    const company = await findOrCreateByName(session.user.id, trimmed)
    revalidatePath("/companies")
    return { id: company.id }
  } catch {
    return { error: "Could not save that company. Please try again." }
  }
}

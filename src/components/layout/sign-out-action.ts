"use server"

import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth/auth.config"

const { signOut } = NextAuth(authConfig)

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}

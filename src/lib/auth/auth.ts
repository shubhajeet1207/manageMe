import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { verifyCredentials } from "@/server/services/auth-service"
import { authConfig } from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== "string" || typeof password !== "string") {
          return null
        }
        const user = await verifyCredentials(email, password)
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email, image: user.image }
      },
    }),
  ],
})

import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth/auth.config"

const { auth } = NextAuth(authConfig)

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/applications", "/companies"]

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix)
  )

  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/applications/:path*",
    "/companies/:path*",
  ],
}

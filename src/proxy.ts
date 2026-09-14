import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth/auth.config"

const { auth } = NextAuth(authConfig)

// Kept in sync with config.matcher below, and they must move together: the
// matcher decides which requests this proxy sees at all, this list decides what
// happens to them. Updating one alone leaves a route half-protected, silently.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/analytics",
  "/settings",
  "/applications",
  "/companies",
  "/resumes",
  "/documents",
  "/projects",
  "/tasks",
  "/links",
  "/quickdrop",
  "/credentials",
]

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
  // Every prefix in PROTECTED_PREFIXES above appears here, and nothing else.
  // `/api/documents/:path*` is deliberately absent, for the same reason
  // `/api/resume-versions` is: those handlers authenticate themselves and
  // return 404, while a proxy redirect would render the login page inside an
  // <object> or break an <img> (Phase 4 §11).
  matcher: [
    "/dashboard/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/applications/:path*",
    "/companies/:path*",
    "/resumes/:path*",
    "/documents/:path*",
    "/projects/:path*",
    "/tasks/:path*",
    "/links/:path*",
    "/quickdrop/:path*",
    "/credentials/:path*",
  ],
}

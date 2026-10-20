import { auth } from "@/lib/auth/auth"
import { collectionReaders } from "@/server/repositories/collection-repository"
import { pageInputSchema, InvalidCursorError } from "@/server/pagination"
import { createConfiguredRateLimiter } from "@/lib/rate-limit"
import { logEvent } from "@/lib/observability/logger"

const limiter = createConfiguredRateLimiter({ burst: 60, refillIntervalMs: 1000 }, "collections")
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const session = await auth()
  const headers = { "Cache-Control": "private, no-store" }
  if (!session?.user?.id) return Response.json({ error: "Sign in to continue" }, { status: 401, headers })
  const decision = await limiter.consume(session.user.id)
  if (!decision.allowed) return Response.json({ error: "Please try again shortly" }, { status: 429, headers: { ...headers, "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) } })
  const { collection } = await params
  if (!Object.hasOwn(collectionReaders, collection)) return Response.json({ error: "Not found" }, { status: 404, headers })
  const parsed = pageInputSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return Response.json({ error: "Invalid search or page size" }, { status: 400, headers })
  try {
    return Response.json(await collectionReaders[collection as keyof typeof collectionReaders](session.user.id, parsed.data), { headers })
  } catch (error) {
    if (error instanceof InvalidCursorError || (error instanceof Error && error.message === "Invalid status filter")) return Response.json({ error: error.message }, { status: 400, headers })
    logEvent("error", "collection.read_failed", { collection, error })
    return Response.json({ error: "Unable to load this page. Try again." }, { status: 503, headers })
  }
}

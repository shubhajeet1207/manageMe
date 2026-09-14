import { prisma } from "@/lib/db/prisma"

/**
 * The load-balancer probe.
 *
 * Unauthenticated on purpose, and absent from `config.matcher` in src/proxy.ts
 * on purpose: a matched path would answer an unauthenticated probe with a 307 to
 * /login, and most health checkers score a 3xx as a pass. The app would keep
 * reporting healthy straight through an outage. Adding "/api/health" to that
 * matcher is the one edit that silently breaks this file.
 */

/**
 * Postgres is in us-west-2 and every probe crosses a WAN. A pool whose socket
 * has gone away does not reject, it waits — so without a deadline this handler
 * hangs until the checker's own timeout fires, which is slower than the probe
 * interval and is reported as "no response" rather than "unhealthy". Answering
 * 503 ourselves is faster and unambiguous.
 */
const PROBE_TIMEOUT_MS = 3000

async function databaseReachable(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      // `SELECT 1` touches no table, so the probe does not start failing the day
      // someone renames one, and it cannot be served from anything cached: it
      // needs a live connection out of the pool and a real round trip.
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health probe timed out")), PROBE_TIMEOUT_MS)
      }),
    ])
    return true
  } catch (error) {
    // Server-side only. The operator needs the driver's reason; the caller gets
    // the bare verdict below and nothing more.
    console.error("[health] database probe failed", error)
    return false
  } finally {
    // A pending timer keeps the event loop awake for PROBE_TIMEOUT_MS after
    // every *successful* probe — once per probe interval, for the life of the
    // process.
    clearTimeout(timer)
  }
}

/**
 * GET only. Next auto-implements HEAD from GET
 * (server/route-modules/app-route/helpers/auto-implement-methods.js), so a
 * checker configured for HEAD gets the same status code without a second
 * handler here.
 */
export async function GET(): Promise<Response> {
  const ok = await databaseReachable()

  return Response.json(
    // Two fixed strings, and deliberately nothing else. A version, a commit sha,
    // a database host or the driver's error text are all things this endpoint
    // would be handing to anyone on the internet, since it has no auth.
    { status: ok ? "ok" : "unavailable" },
    {
      status: ok ? 200 : 503,
      // A health check that can be cached is a health check that cannot fail: a
      // CDN — or the load balancer itself — would replay the last 200 through
      // the very outage this endpoint exists to catch.
      headers: { "cache-control": "no-store" },
    }
  )
}

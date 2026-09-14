/**
 * Rate limiting for the unauthenticated auth actions.
 *
 * Every login attempt costs a full argon2id verification — @node-rs/argon2's
 * defaults allocate 19 MiB and burn CPU on purpose — so an unthrottled login
 * action is not only a password-guessing surface, it is a cheap way to exhaust
 * the box. Signup is the same shape plus a database round trip, and it is the
 * app's only account-existence oracle (see signup/actions.ts).
 *
 * THE STATE IS A MODULE-LEVEL MAP AND DOES NOT SURVIVE MULTIPLE INSTANCES. Two
 * processes, or two containers behind a load balancer, each keep their own
 * counters, so the effective limit multiplies by the instance count; any restart
 * (including every dev-server recompile) clears it. That is an accepted trade
 * for a single-instance deployment, and it is exactly why `RateLimiter` below is
 * an interface: a Redis-backed implementation slots in behind it without a
 * single caller changing.
 *
 * Node runtime only. Importing this from src/proxy.ts would put it somewhere the
 * module state is not guaranteed to persist between requests, which is a limiter
 * that silently never limits.
 */

/** One key's bucket. Plain data, so a future store can serialise it as-is. */
interface TokenBucket {
  /** Attempts still available. Fractional, because refill is continuous. */
  tokens: number
  /** The clock reading `tokens` was last computed against. */
  updatedAtMs: number
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number }

/**
 * The swap seam. Callers depend on this and never on the implementation below,
 * so replacing the backend is one new function here.
 *
 * Deliberately async even though the in-process implementation never awaits
 * anything: a distributed limiter has to do a network round trip, and if these
 * were synchronous now, adopting one later would mean threading `await` back
 * through every call site.
 */
export interface RateLimiter {
  /** Spend one attempt against `key`. */
  consume(key: string): Promise<RateLimitDecision>
  /** Forget `key` — for when a request has proven it was the real user. */
  reset(key: string): Promise<void>
}

export interface InProcessRateLimiterOptions {
  /** Attempts allowed back-to-back before throttling begins. */
  burst: number
  /** How long one spent attempt takes to come back. */
  refillIntervalMs: number
  /** Injected by tests; production omits it and gets the wall clock. */
  now?: () => number
}

/**
 * Keys are derived from request headers, so an attacker rotating
 * X-Forwarded-For mints a fresh bucket per request. Uncapped, the limiter would
 * be the memory exhaustion it was added to prevent.
 *
 * Evicting a bucket only ever *grants* attempts — it can never deny one — so a
 * flood that rotates keys degrades this toward "no IP limit", never toward
 * locking the real user out.
 */
export const MAX_TRACKED_KEYS = 10_000

/**
 * A token bucket rather than a fixed or sliding window, because the failure mode
 * that matters here is locking the single legitimate user out of their own app.
 * A window has a cliff: trip it and you wait out the whole window, and an
 * attacker hammering the owner's email key can hold them at that cliff. A bucket
 * that refills continuously hands the real user their next attempt one
 * refillInterval after the last, whatever anyone else is doing.
 */
export function createInProcessRateLimiter(
  options: InProcessRateLimiterOptions
): RateLimiter {
  const { burst, refillIntervalMs } = options
  const now = options.now ?? Date.now
  const buckets = new Map<string, TokenBucket>()

  function remember(key: string, bucket: TokenBucket): void {
    // Delete-then-set moves the key to the end of the Map's iteration order,
    // which makes the eviction below least-recently-used instead of
    // oldest-created — otherwise a long-lived flood would evict the owner's
    // bucket while keeping ten thousand one-shot ones.
    buckets.delete(key)
    buckets.set(key, bucket)
    while (buckets.size > MAX_TRACKED_KEYS) {
      const oldest = buckets.keys().next()
      if (oldest.done) break
      buckets.delete(oldest.value)
    }
  }

  return {
    async consume(key) {
      const at = now()
      const bucket = buckets.get(key) ?? { tokens: burst, updatedAtMs: at }
      // Clamped at zero: an NTP step backwards must not be able to charge the
      // caller for time that did not pass, which would report a retryAfterMs
      // several intervals long for a bucket that is one token short.
      const elapsedMs = Math.max(0, at - bucket.updatedAtMs)
      const tokens = Math.min(burst, bucket.tokens + elapsedMs / refillIntervalMs)

      if (tokens < 1) {
        // The refill is persisted even on a denial so that repeated hammering
        // while throttled does not reset the clock on the wait — the real user
        // retrying every two seconds must still get in at the same moment they
        // would have by waiting quietly.
        remember(key, { tokens, updatedAtMs: at })
        return { allowed: false, retryAfterMs: Math.ceil((1 - tokens) * refillIntervalMs) }
      }

      remember(key, { tokens: tokens - 1, updatedAtMs: at })
      return { allowed: true, remaining: Math.floor(tokens - 1) }
    },

    async reset(key) {
      buckets.delete(key)
    },
  }
}

/**
 * Login: ten attempts back to back, then one more every 30 seconds.
 *
 * The burst is sized by the forgotten-password case, not by the attacker. The
 * one real user working through "was it the old one, or the one with the 7?"
 * needs five or six tries in a row and must never hit a wall for that; ten
 * leaves headroom and is still nowhere near a password list.
 *
 * The refill is what makes the limit safe to apply to the email key at all.
 * Under a fixed window, an attacker hammering the owner's address would hold
 * them out until the window rolled; with a bucket, the worst anyone can ever
 * cost the owner is a 30-second wait. Sustained, this holds an attacker to two
 * argon2id verifications per minute per key — useless for guessing, and no
 * measurable load on the box.
 */
const LOGIN_BURST = 10
const LOGIN_REFILL_INTERVAL_MS = 30_000

export const loginRateLimiter: RateLimiter = createInProcessRateLimiter({
  burst: LOGIN_BURST,
  refillIntervalMs: LOGIN_REFILL_INTERVAL_MS,
})

/**
 * Signup: five attempts, then one every five minutes.
 *
 * Far harsher than login because the legitimate act is once per lifetime — the
 * owner creates their account and never returns to this form. Five covers "the
 * first submit errored and I resubmitted"; one per five minutes prices the
 * account-existence oracle in signup/actions.ts at twelve probes an hour per IP,
 * which is not a list anyone walks.
 */
const SIGNUP_BURST = 5
const SIGNUP_REFILL_INTERVAL_MS = 5 * 60_000

export const signupRateLimiter: RateLimiter = createInProcessRateLimiter({
  burst: SIGNUP_BURST,
  refillIntervalMs: SIGNUP_REFILL_INTERVAL_MS,
})

/**
 * The longest a key's value may be before it is truncated.
 *
 * MAX_TRACKED_KEYS bounds how MANY buckets are retained; without this, nothing
 * bounds what they weigh, and both key sources are attacker-controlled. Node
 * accepts a header line of ~16KB and neither auth schema caps the email's
 * length, so ten thousand distinct oversized values is ~160MB of Map keys held
 * until eviction — the memory exhaustion the cap above exists to prevent,
 * reached through a longer door.
 *
 * 254 is RFC 5321's maximum address length and five times the longest IPv6
 * form, so it cannot truncate a value this app could legitimately see. Two
 * absurd values sharing a prefix collapse into one bucket, which only ever
 * throttles them harder — the same safe direction as eviction, never toward
 * locking the real user out.
 */
const MAX_KEY_VALUE_LENGTH = 254

/** Namespaced, so an address-shaped IP can never share a bucket with an email. */
function namespacedKey(namespace: string, value: string): string {
  return `${namespace}:${value.slice(0, MAX_KEY_VALUE_LENGTH)}`
}

export function ipKey(ip: string): string {
  return namespacedKey("ip", ip)
}

/**
 * Pass the parsed email, not the raw form value: the auth schemas trim and
 * lowercase it, and keying on the raw string would give "Ada@Example.com " its
 * own bucket to spend.
 */
export function emailKey(email: string): string {
  return namespacedKey("email", email)
}

/**
 * Spends one attempt on every key and returns the strictest answer.
 *
 * Every key is charged even once one has already denied: one request must cost
 * one attempt everywhere it is counted, or an attacker who has tripped the IP
 * bucket would stop paying into the email bucket for free.
 */
export async function consumeAll(
  limiter: RateLimiter,
  keys: string[]
): Promise<RateLimitDecision> {
  const decisions = await Promise.all(keys.map((key) => limiter.consume(key)))

  let retryAfterMs = 0
  let remaining = Number.POSITIVE_INFINITY
  for (const decision of decisions) {
    if (decision.allowed) remaining = Math.min(remaining, decision.remaining)
    else retryAfterMs = Math.max(retryAfterMs, decision.retryAfterMs)
  }

  if (retryAfterMs > 0) return { allowed: false, retryAfterMs }
  return { allowed: true, remaining: remaining === Number.POSITIVE_INFINITY ? 0 : remaining }
}

export async function resetAll(limiter: RateLimiter, keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => limiter.reset(key)))
}

/**
 * Every request that arrives without a forwarding header shares this one bucket.
 * That is the correct conservative choice — an unattributable flood is still
 * throttled — but it does mean that on a deployment with no proxy in front, a
 * flood and the owner share a limit. The bucket's refill is what keeps that an
 * inconvenience instead of a lockout.
 */
export const UNKNOWN_CLIENT_IP = "unknown"

/**
 * Takes a Headers object rather than calling next/headers itself, so this file
 * stays framework-free and unit-testable.
 *
 * X-Forwarded-For is client-supplied and is only trustworthy if the deployment
 * sits behind a proxy that OVERWRITES it. Deployed without one, an attacker
 * rotates the header and gets a fresh IP bucket every request; the email key is
 * the one that still bites in that case. The leftmost entry is used because a
 * conforming proxy appends, so it is the closest thing to the origin client.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) return first
  }

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  return UNKNOWN_CLIENT_IP
}

/**
 * Throttled users are told when to come back. Guessing is the part that makes a
 * rate limit feel like a bug report, and the wait is already observable by
 * retrying, so naming it gives an attacker nothing they did not have.
 */
export function retryAfterMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`
  return `${Math.ceil(seconds / 60)} minutes`
}

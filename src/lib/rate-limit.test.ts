import { describe, expect, it } from "vitest"
import {
  MAX_TRACKED_KEYS,
  UNKNOWN_CLIENT_IP,
  clientIpFromHeaders,
  consumeAll,
  createInProcessRateLimiter,
  emailKey,
  ipKey,
  loginRateLimiter,
  resetAll,
  retryAfterMessage,
  signupRateLimiter,
  type RateLimiter,
} from "./rate-limit"

/** The clock is injected precisely so none of this waits on a real one — a test
 *  that proves a 30-second window expires must not take 30 seconds. */
function fakeClock(startMs = 1_000_000) {
  let nowMs = startMs
  return {
    now: () => nowMs,
    advance(ms: number) {
      nowMs += ms
    },
  }
}

const BURST = 3
const REFILL_MS = 1000

function limiterWithClock(clock: { now: () => number }): RateLimiter {
  return createInProcessRateLimiter({
    burst: BURST,
    refillIntervalMs: REFILL_MS,
    now: clock.now,
  })
}

async function consumeTimes(limiter: RateLimiter, key: string, times: number) {
  const results = []
  for (let i = 0; i < times; i++) results.push(await limiter.consume(key))
  return results
}

describe("createInProcessRateLimiter", () => {
  it("allows the whole burst back to back", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)

    const results = await consumeTimes(limiter, "k", BURST)

    expect(results.map((r) => r.allowed)).toEqual([true, true, true])
    expect(results.map((r) => (r.allowed ? r.remaining : -1))).toEqual([2, 1, 0])
  })

  it("denies the attempt past the burst and names the wait", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)

    const denied = await limiter.consume("k")

    expect(denied.allowed).toBe(false)
    // One whole interval, because the bucket is empty rather than part-full.
    expect(denied.allowed ? null : denied.retryAfterMs).toBe(REFILL_MS)
  })

  it("expires the window: one interval buys exactly one more attempt", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)
    expect((await limiter.consume("k")).allowed).toBe(false)

    clock.advance(REFILL_MS)

    expect((await limiter.consume("k")).allowed).toBe(true)
    // Exactly one: a limiter that refilled the whole bucket per interval would
    // let a flood through in bursts of three every second.
    expect((await limiter.consume("k")).allowed).toBe(false)
  })

  it("refills proportionally within an interval", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)

    clock.advance(REFILL_MS / 2)
    const denied = await limiter.consume("k")

    expect(denied.allowed).toBe(false)
    expect(denied.allowed ? null : denied.retryAfterMs).toBe(REFILL_MS / 2)
  })

  it("does not bank attempts above the burst while idle", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)

    clock.advance(REFILL_MS * 1000)

    const results = await consumeTimes(limiter, "k", BURST + 1)
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
  })

  it("does not push the wait further out when a throttled caller keeps trying", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)

    // The real user mashing the button must not starve themselves: hammering is
    // what a person does when a form rejects them, and a limiter that charged
    // for it would never let them back in.
    for (let i = 0; i < 20; i++) {
      clock.advance(10)
      await limiter.consume("k")
    }
    clock.advance(REFILL_MS - 200)

    expect((await limiter.consume("k")).allowed).toBe(true)
  })

  it("keeps keys independent", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "a", BURST)

    expect((await limiter.consume("a")).allowed).toBe(false)
    expect((await limiter.consume("b")).allowed).toBe(true)
  })

  it("restores the full burst on reset", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)
    expect((await limiter.consume("k")).allowed).toBe(false)

    await limiter.reset("k")

    const results = await consumeTimes(limiter, "k", BURST)
    expect(results.every((r) => r.allowed)).toBe(true)
  })

  it("bounds how many keys it tracks, and evicts least-recently-used", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "victim", BURST)
    expect((await limiter.consume("victim")).allowed).toBe(false)

    // A flood rotating X-Forwarded-For mints a bucket per request. Uncapped, the
    // limiter is the memory exhaustion it was added to prevent.
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) await limiter.consume(`flood-${i}`)

    // "victim" was the least-recently-used key, so it is gone and starts fresh.
    // This asserts the accepted weakness rather than hiding it: eviction can
    // only ever GRANT attempts. If it ever denies one, a flood could evict its
    // way into locking the real user out, which is the opposite of the point.
    expect((await limiter.consume("victim")).allowed).toBe(true)

    // And the flood's most recent key survived, so the cap evicts something
    // rather than refusing to track anything new.
    const recent = await consumeTimes(limiter, `flood-${MAX_TRACKED_KEYS - 1}`, BURST)
    expect(recent.map((r) => r.allowed)).toEqual([true, true, false])
  })

  it("evicts least-recently-used, not oldest-created", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)

    // "owner" is the first key the limiter ever sees, so it is first in line
    // under plain insertion order.
    await limiter.consume("owner")
    for (let i = 0; i < MAX_TRACKED_KEYS - 1; i++) await limiter.consume(`flood-${i}`)

    // ...but it is used again here, which has to move it to the BACK of the
    // queue. Insertion order would evict the owner's bucket while keeping ten
    // thousand single-use flood buckets, which is the wrong key to forget.
    await limiter.consume("owner")
    for (let i = 0; i < 5; i++) await limiter.consume(`late-${i}`)

    // Two of three tokens are spent, so exactly one attempt is left. An evicted
    // bucket would hand back a whole fresh burst and answer true twice.
    const after = await consumeTimes(limiter, "owner", 2)
    expect(after.map((r) => r.allowed)).toEqual([true, false])
  })

  it("survives a clock that steps backwards", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "k", BURST)

    // An NTP correction backwards must not charge the caller for time that did
    // not pass; unclamped, this reports a wait several intervals long for a
    // bucket that is one token short of open.
    clock.advance(-REFILL_MS * 5)
    const denied = await limiter.consume("k")

    expect(denied.allowed).toBe(false)
    expect(denied.allowed ? null : denied.retryAfterMs).toBeLessThanOrEqual(REFILL_MS)
  })
})

describe("consumeAll", () => {
  it("charges every key even once one of them has denied", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "ip", BURST)

    // "ip" is already empty, so this request is denied — but "email" must still
    // be charged, or tripping one bucket would make the other one free.
    await consumeAll(limiter, ["ip", "email"])
    await limiter.reset("ip")

    const remainingOnEmail = await consumeTimes(limiter, "email", BURST)
    expect(remainingOnEmail.map((r) => r.allowed)).toEqual([true, true, false])
  })

  it("reports the longest wait of the denied keys", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "ip", BURST)
    clock.advance(REFILL_MS / 2)
    await consumeTimes(limiter, "email", BURST)

    const decision = await consumeAll(limiter, ["ip", "email"])

    expect(decision.allowed).toBe(false)
    // "ip" is half refilled, "email" is empty — the caller has to be told the
    // wait that actually applies, not the shorter one.
    expect(decision.allowed ? null : decision.retryAfterMs).toBe(REFILL_MS)
  })

  it("reports the smallest remaining when every key allows", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await limiter.consume("ip")

    const decision = await consumeAll(limiter, ["ip", "email"])

    expect(decision.allowed).toBe(true)
    expect(decision.allowed ? decision.remaining : -1).toBe(1)
  })
})

describe("resetAll", () => {
  it("clears every key it is given", async () => {
    const clock = fakeClock()
    const limiter = limiterWithClock(clock)
    await consumeTimes(limiter, "ip", BURST)
    await consumeTimes(limiter, "email", BURST)

    await resetAll(limiter, ["ip", "email"])

    expect((await limiter.consume("ip")).allowed).toBe(true)
    expect((await limiter.consume("email")).allowed).toBe(true)
  })
})

describe("configured auth limiters", () => {
  it("lets the owner fumble their password six times in a row", async () => {
    // The forgotten-password case is the whole reason the login burst is not 3.
    // Unique keys so this does not spend the real limiter's budget for anyone.
    const key = ipKey(`test-${Math.random()}`)
    const results = await consumeTimes(loginRateLimiter, key, 6)

    expect(results.every((r) => r.allowed)).toBe(true)
    await loginRateLimiter.reset(key)
  })

  it("cuts signup off well before login, since signup happens once ever", async () => {
    const key = ipKey(`test-${Math.random()}`)
    const results = await consumeTimes(signupRateLimiter, key, 6)

    // The whole shape, not just the last answer: a limiter that denied every
    // signup would satisfy a check on the denial alone, and a form that refuses
    // the owner's one and only signup is a worse bug than an unmetered one.
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false])
    await signupRateLimiter.reset(key)
  })

  it("actually denies login eventually, rather than counting forever", async () => {
    // The burst is tuned for the owner's forgotten password, so it is generous.
    // Generous must not shade into absent: something has to say no, or the
    // limiter is an elaborate counter and the argon2id flood walks straight in.
    const key = ipKey(`test-${Math.random()}`)
    const results = await consumeTimes(loginRateLimiter, key, 50)

    expect(results.some((r) => !r.allowed)).toBe(true)
    await loginRateLimiter.reset(key)
  })

  it("never asks the owner to wait more than a minute to try logging in again", async () => {
    // The whole failure mode this limiter has to avoid is locking the single
    // real user out of their own app. A denial has to be an inconvenience they
    // wait out at the keyboard, not a reason to go find the database.
    const key = ipKey(`test-${Math.random()}`)
    const results = await consumeTimes(loginRateLimiter, key, 50)
    const denied = results.find((r) => !r.allowed)

    expect(denied?.allowed).toBe(false)
    expect(denied && !denied.allowed ? denied.retryAfterMs : Infinity).toBeLessThanOrEqual(
      60_000
    )
    await loginRateLimiter.reset(key)
  })

  it("keeps the IP and email buckets for one request independent", async () => {
    // consumeAll charges both. If login ever keyed on only one of them, an
    // attacker rotating that one dimension would be unmetered.
    const ip = ipKey(`test-${Math.random()}`)
    const email = emailKey(`test-${Math.random()}@example.com`)

    const decision = await consumeAll(loginRateLimiter, [ip, email])
    expect(decision.allowed).toBe(true)

    // `remaining` against an untouched control key, not `allowed`. A charged
    // bucket and a fresh one BOTH answer "allowed" here — the burst is ten —
    // so asserting that proves nothing, and this test passed unchanged against
    // a consumeAll mutated to charge only keys[0]. The token count is the one
    // thing that can tell a charged bucket from an uncharged one.
    const control = await loginRateLimiter.consume(ipKey(`test-${Math.random()}`))
    const afterIp = await loginRateLimiter.consume(ip)
    const afterEmail = await loginRateLimiter.consume(email)

    const fresh = control.allowed ? control.remaining : -1
    expect(afterIp.allowed ? afterIp.remaining : -1).toBe(fresh - 1)
    expect(afterEmail.allowed ? afterEmail.remaining : -1).toBe(fresh - 1)
    await resetAll(loginRateLimiter, [ip, email])
  })
})

describe("clientIpFromHeaders", () => {
  it("takes the leftmost X-Forwarded-For entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 10.0.0.1" })
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7")
  })

  it("trims the entry so whitespace cannot mint a second bucket", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1" })
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7")
  })

  it("falls back to X-Real-IP", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9"
    )
  })

  it("falls back to a shared bucket when nothing identifies the client", () => {
    expect(clientIpFromHeaders(new Headers())).toBe(UNKNOWN_CLIENT_IP)
    // An empty or whitespace-only header is "nothing", not a valid key — a blank
    // bucket name would otherwise be one an attacker could opt into.
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " " }))).toBe(
      UNKNOWN_CLIENT_IP
    )
  })
})

describe("key namespacing", () => {
  it("keeps an IP and an email in separate buckets", () => {
    expect(ipKey("203.0.113.7")).not.toBe(emailKey("203.0.113.7"))
  })
})

describe("retryAfterMessage", () => {
  it("counts in seconds for short waits", () => {
    expect(retryAfterMessage(1000)).toBe("1 second")
    expect(retryAfterMessage(30_000)).toBe("30 seconds")
  })

  it("rounds up, so the wait it names is never too short to work", () => {
    expect(retryAfterMessage(1)).toBe("1 second")
    expect(retryAfterMessage(29_001)).toBe("30 seconds")
  })

  it("switches to minutes for long waits", () => {
    expect(retryAfterMessage(5 * 60_000)).toBe("5 minutes")
  })
})

import { defineConfig, devices } from "@playwright/test"

// GitHub Actions (and every other runner) sets CI=true. Every branch below that
// differs between a laptop and CI hangs off this one flag rather than being
// spelled out three times with a chance to drift.
const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every spec signs up a real user against the ONE database in DATABASE_URL and
  // deletes it again in afterEach, keying on an email minted from `Date.now()`.
  // Two workers can mint the same millisecond, and with three browser projects
  // the same spec body runs three times over the same rows. Serialising the
  // whole run is what keeps "this test cleaned up after itself" true. It also
  // keeps write pressure off the status-write path, whose serialization-conflict
  // retry budget is sized for the app's own concurrency, not the test runner's.
  workers: 1,
  // A `.only` left in a spec silently shrinks the suite to one test while still
  // reporting green. Locally that is a useful debugging tool; in CI it is a way
  // to merge untested code, so CI fails on it instead of honouring it.
  forbidOnly: isCI,
  // Signup and login cross the network several times each (see the expect
  // timeout below), so a genuinely passing test can still lose to a slow runner.
  // Two retries absorb that. Locally zero, so a flake is visible rather than
  // papered over while the developer watches.
  retries: isCI ? 2 : 0,
  // "github" annotates the failing line in the PR diff; the HTML report is the
  // artifact the workflow uploads. `open: "never"` matters in CI — the default
  // ("on-failure") tries to launch a browser on a headless runner and hangs.
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  webServer: {
    // `next dev` is not the artifact being shipped: it skips the production
    // build, serves uncompiled routes, and has caught none of the build-time
    // failures (a bad server/client boundary, a prerender error) that CI exists
    // to catch. CI tests what would be deployed; a laptop keeps the fast loop.
    command: isCI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    // Unconditional reuse is a CI-shaped bug: anything already listening on 3000
    // is adopted and tested instead of this commit's code, so the run reports on
    // a server nobody can identify. Locally, reuse is the point — it attaches to
    // the dev server the developer already has open.
    reuseExistingServer: !isCI,
    // The CI command has to finish `next build` before the port opens, which the
    // 120s that suffices for `next dev` does not cover.
    timeout: isCI ? 300_000 : 120_000,
    // Playwright ignores a web server's stdout by default, so a `next build`
    // that fails in CI surfaces as "Timed out waiting 300000ms" and nothing
    // else — the one error message that would explain it having been swallowed.
    // Locally the developer already has the dev server's output in a terminal.
    stdout: isCI ? "pipe" : "ignore",
  },
  // Signup/login run argon2id twice (hash on create, verify on sign-in) against a
  // remote Postgres, which exceeds Playwright's 5s expect default on a cold path.
  expect: { timeout: 30_000 },
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    // On the first retry only: a trace of every passing run is gigabytes of
    // artifact for nothing, and a trace of the first failure is unavailable
    // anyway when the failure does not reproduce.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // One engine is not evidence about three. The app leans on Base UI and Radix
  // popovers, dnd-kit pointer events, and the browser's own PDF viewer in an
  // <object> — all three areas where WebKit and Gecko differ from Chromium in
  // ways only they can report. Locally, `pnpm test:e2e --project=chromium`
  // remains the fast path.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
})

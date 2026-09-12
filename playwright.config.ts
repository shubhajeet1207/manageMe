import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  // Signup/login run argon2id twice (hash on create, verify on sign-in) against a
  // remote Postgres, which exceeds Playwright's 5s expect default on a cold path.
  expect: { timeout: 30_000 },
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
  },
})
